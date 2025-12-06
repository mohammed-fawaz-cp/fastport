import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:uuid/uuid.dart';
import 'crypto_utils.dart';

typedef MessageCallback = void Function(String message, int timestamp);
typedef FileCallback = void Function(String fileName, List<int> fileData);

class FastPort {
  final String serverUrl;
  final String sessionName;
  final String password;
  final String aesKey;
  final int retryInterval;
  final int maxRetries;

  WebSocketChannel? _channel;
  late CryptoUtils _crypto;
  bool _initialized = false;
  bool _reconnecting = false;

  final Map<String, List<MessageCallback>> _subscriptions = {};
  final Map<String, List<FileCallback>> _fileSubscriptions = {};
  final Map<String, _IncomingFile> _incomingFiles = {};
  
  final Map<String, Completer<void>> _pendingAcks = {};
  final Map<String, int> _retryCount = {};
  final Map<String, Timer> _retryTimers = {};

  FastPort({
    required this.serverUrl,
    required this.sessionName,
    required this.password,
    required this.aesKey,
    this.retryInterval = 5000,
    this.maxRetries = 100,
  }) {
    _crypto = CryptoUtils(aesKey);
  }

  Future<void> init() async {
    if (_initialized) return;

    await _connect();
    _initialized = true;
  }

  Future<void> _connect() async {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(serverUrl));
      
      // Send init message
      _send({
        'type': 'init',
        'sessionName': sessionName,
        'password': password,
      });

      // Listen for messages
      _channel!.stream.listen(
        _handleMessage,
        onError: _handleError,
        onDone: _handleDisconnect,
      );

      // Wait for init response
      await _waitForInit();
    } catch (e) {
      throw Exception('Failed to connect: $e');
    }
  }

  Future<void> _waitForInit() async {
    // Actually, _handleMessage parses JSON.
    // However, we need to capture the FIRST message for init.
    // But _channel stream is single-subscription usually? No, WebSocketChannel stream is single-subscription.
    // If we listen in _connect, we can't listen again here.
    // Logic in original code was: listen in _waitForInit inside _connect?
    // Original code:
    // _channel!.stream.listen(_handleMessage...) 
    // AND then wait for Init?
    
    // Wait, original code had:
    // _waitForInit() { final subscription = _channel!.stream.listen ... }
    // If stream is single subscription, the first listen() in _connect would claim it.
    // Looking at original code (Step 669):
    // Line 57: _channel!.stream.listen(...)
    // Line 64: await _waitForInit();
    // Line 73: _channel!.stream.listen(...) inside _waitForInit.
    // This implies `WebSocketChannel` stream is broadcast OR original code was buggy/using a broadcast wrapper?
    // `web_socket_channel` creates a single-subscription stream by default.
    // If the original code ran, it must have been handled or I misread it.
    // OR `_waitForInit` was called BEFORE setting up the main listener?
    // Original: 
    // Line 57: listen(_handleMessage...)
    // Line 64: _waitForInit()
    
    // This is suspicious. Standard Stream throws if listened twice.
    // Assuming the original code worked, maybe `asBroadcastStream()` was used or implicitly handled?
    // But assuming I want to be safe, I should handle `init_response` inside `_handleMessage`.
    // Let's refactor to use a Completer exposed to `_handleMessage`.
    
    // BUT, to avoid changing too much logic if I don't need to, I'll stick to the original plan IF I can.
    // Since I'm rewriting, I'll use a `_initCompleter` and resolve it in `_handleMessage`.
    
    if (_initCompleter != null && !_initCompleter!.isCompleted) return _initCompleter!.future;
    _initCompleter = Completer<void>();
    return _initCompleter!.future.timeout(Duration(seconds: 10));
  }
  
  Completer<void>? _initCompleter;

  void _handleMessage(dynamic data) {
    try {
      if (data is String) {
          _handleTextMessage(jsonDecode(data));
      } else if (data is List<int>) {
          _handleBinaryMessage(Uint8List.fromList(data));
      } else {
          print('Unknown message format: ${data.runtimeType}');
      }
    } catch (e) {
      print('Error handling message: $e');
    }
  }

  void _handleTextMessage(Map<String, dynamic> message) {
      if (message['type'] == 'init_response') {
          if (_initCompleter != null && !_initCompleter!.isCompleted) {
             if (message['success'] == true) {
                 _initCompleter!.complete();
             } else {
                 _initCompleter!.completeError(message['error'] ?? 'Init failed');
             }
          }
          return;
      }

      switch (message['type']) {
        case 'message':
          _handleIncomingMessage(message);
          break;
        case 'ack_received':
          _handleAckReceived(message);
          break;
        case 'init_file':
        // Binary chunks don't come here, but init/end signals do.
        case 'end_file':
          _handleFileSignal(message);
          break;
        case 'subscribe_response':
        case 'unsubscribe_response':
        case 'publish_response':
        case 'log': 
          break;
      }
  }

  void _handleBinaryMessage(Uint8List bytes) {
      // Format: [Type: 1B] [FileID: 36B] [Index: 4B] [Encrypted Payload]
      if (bytes.length < 41) return; // Min length

      final type = bytes[0];
      
      if (type == 0x02) { // File Chunk
          final fileIdBytes = bytes.sublist(1, 37);
          final fileId = String.fromCharCodes(fileIdBytes); // UUID is ASCII
          
          // chunkIndex at byte 37 (not used currently, TCP ensures order)
          
          final encryptedPayload = bytes.sublist(41);
          final decryptedData = _crypto.decryptBytes(encryptedPayload);

          final incoming = _incomingFiles[fileId];
          if (incoming != null) {
              // Ensure order? For now assume naive append or Map<Index, Data>
              // Map is safer for UDP-like, but TCP ensures order usually.
              // To handle re-ordering or concurrency, we should ideally use index.
              // But strictly sequentially for now:
              incoming.chunks.add(decryptedData);
          }
      }
  }

  void _handleIncomingMessage(Map<String, dynamic> message) {
    final topic = message['topic'];
    final encryptedData = message['data'];
    final hash = message['hash'];
    final timestamp = message['timestamp'];
    final messageId = message['messageId'];

    try {
      // Verify hash
      if (!_crypto.verifyHash(encryptedData, hash)) {
        print('Hash verification failed for message $messageId');
        return;
      }

      // Decrypt
      final decryptedMessage = _crypto.decryptMessage(encryptedData);

      // Send ACK
      _send({
        'type': 'ack',
        'topic': topic,
        'messageId': messageId,
      });

      // Call callbacks
      if (_subscriptions.containsKey(topic)) {
        for (var callback in _subscriptions[topic]!) {
          callback(decryptedMessage, timestamp);
        }
      }
    } catch (e) {
      print('Error processing message: $e');
    }
  }

  void _handleAckReceived(Map<String, dynamic> message) {
    final messageId = message['messageId'];
    
    // Cancel retry timer
    _retryTimers[messageId]?.cancel();
    _retryTimers.remove(messageId);
    _retryCount.remove(messageId);
    
    // Complete pending ack
    if (_pendingAcks.containsKey(messageId)) {
      _pendingAcks[messageId]!.complete();
      _pendingAcks.remove(messageId);
    }
  }
  
  // --- File Handling ---

  void onFile(String topic, FileCallback callback) {
     if (!_initialized) throw Exception('FastPort not initialized');
     if (!_fileSubscriptions.containsKey(topic)) {
         _fileSubscriptions[topic] = [];
         _send({'type': 'subscribe', 'topic': topic});
     }
     _fileSubscriptions[topic]!.add(callback);
  }

  /// Register FCM token for push notifications
  /// 
  /// [userId] - Unique identifier for the user
  /// [fcmToken] - Firebase Cloud Messaging token from Firebase SDK
  /// [deviceId] - Unique device identifier
  /// [platform] - Platform type: 'android', 'ios', or 'web'
  Future<void> registerFCMToken({
    required String userId,
    required String fcmToken,
    required String deviceId,
    String platform = 'android',
  }) async {
    if (!_initialized) throw Exception('FastPort not initialized');

    // Create payload
    final payload = jsonEncode({
      'fcmToken': fcmToken,
      'deviceId': deviceId,
      'platform': platform,
    });

    // Encrypt payload
    final encryptedData = _crypto.encryptMessage(payload);
    final hash = _crypto.generateHash(encryptedData);

    // Send to server
    _send({
      'type': 'register_fcm_token',
      'userId': userId,
      'encryptedData': encryptedData,
      'hash': hash,
    });

    print('[FCM] Token registration sent for user: $userId');
  }

  Future<void> sendFile(String filePath, String topic) async {
    if (!_initialized) throw Exception('FastPort not initialized');

    final file = File(filePath);
    if (!await file.exists()) throw Exception('File not found');

    final fileName = file.uri.pathSegments.last;
    final fileSize = await file.length();
    final fileId = Uuid().v4(); // 36 chars
    final chunkSize = 64 * 1024; // 64KB
    final totalChunks = (fileSize / chunkSize).ceil();

    // 1. Send Init (JSON)
    _send({
      'type': 'init_file',
      'fileId': fileId,
      'fileName': fileName,
      'fileSize': fileSize,
      'totalChunks': totalChunks,
      'topic': topic
    });
    
    await Future.delayed(Duration(milliseconds: 10));

    // 2. Stream Binary Chunks
    int chunkIndex = 0;
    final stream = file.openRead();
    
    // Prepare unchanging header parts
    final typeByte = 0x02;
    final fileIdBytes = Uint8List.fromList(fileId.codeUnits); // 36 bytes

    await for (final chunk in stream) {
        final rawBytes = Uint8List.fromList(chunk);
        final encryptedChunk = _crypto.encryptBytes(rawBytes);

        // Header: [Type (1)] + [FileID (36)] + [Index (4)] = 41 bytes
        final frameSize = 41 + encryptedChunk.length;
        final frame = Uint8List(frameSize);
        final view = ByteData.view(frame.buffer);

        frame[0] = typeByte;
        frame.setAll(1, fileIdBytes);
        view.setUint32(37, chunkIndex);
        frame.setAll(41, encryptedChunk);

        print('[Client] Sending binary chunk $chunkIndex, size=${frame.length}');
        _sendBinary(frame);

        chunkIndex++;
        // Throttling
        if (chunkIndex % 10 == 0) await Future.delayed(Duration(milliseconds: 1)); 
    }

    print('[Client] Sent $chunkIndex chunks total');

    // 3. Send End (JSON)
    _send({
        'type': 'end_file',
        'fileId': fileId,
        'hash': '', 
        'topic': topic
    });
  }

  void _handleFileSignal(Map<String, dynamic> msg) {
      final type = msg['type'];
      final fileId = msg['fileId'];
      
      if (type == 'init_file') {
          _incomingFiles[fileId] = _IncomingFile(
              fileName: msg['fileName'],
              fileSize: msg['fileSize'],
              totalChunks: msg['totalChunks'],
              topic: msg['topic']
          );
      } else if (type == 'end_file') {
          final incoming = _incomingFiles[fileId];
          if (incoming == null) return;
          
          final allBytes = incoming.chunks.expand((x) => x).toList();
          final topic = incoming.topic;
          
          if (topic != null && _fileSubscriptions.containsKey(topic)) {
              for (var cb in _fileSubscriptions[topic]!) {
                  cb(incoming.fileName, allBytes);
              }
          }
          _incomingFiles.remove(fileId);
      }
  }

  // --- Connection Management ---

  void _handleError(error) {
    print('WebSocket error: $error');
    _reconnect();
  }

  void _handleDisconnect() {
    print('WebSocket disconnected');
    _reconnect();
  }

  Future<void> _reconnect() async {
    if (_reconnecting) return;
    _reconnecting = true;

    await Future.delayed(Duration(seconds: 2));

    try {
      if (_channel != null) {
          try { _channel!.sink.close(); } catch(e){}
      }
      
      _initCompleter = null; // Reset init
      await _connect();
      
      // Resubscribe to all topics
      for (var topic in _subscriptions.keys) {
        _send({'type': 'subscribe', 'topic': topic});
      }
       for (var topic in _fileSubscriptions.keys) {
        _send({'type': 'subscribe', 'topic': topic});
      }
      
      _reconnecting = false;
    } catch (e) {
      _reconnecting = false;
      _reconnect();
    }
  }

  Future<void> emit(String topic, String message) async {
    if (!_initialized) throw Exception('FastPort not initialized. Call init() first.');

    final messageId = Uuid().v4();
    final encryptedData = _crypto.encryptMessage(message);
    final hash = _crypto.generateHash(encryptedData);
    final timestamp = DateTime.now().millisecondsSinceEpoch;

    final payload = {
      'type': 'publish',
      'topic': topic,
      'data': encryptedData,
      'hash': hash,
      'timestamp': timestamp,
      'messageId': messageId,
    };

    _send(payload);

    _retryCount[messageId] = 0;
    _pendingAcks[messageId] = Completer<void>();
    _scheduleRetry(messageId, payload);
  }

  void _scheduleRetry(String messageId, Map<String, dynamic> payload) {
    _retryTimers[messageId] = Timer(Duration(milliseconds: retryInterval), () {
      if (!_pendingAcks.containsKey(messageId)) return;

      final count = _retryCount[messageId] ?? 0;
      if (count >= maxRetries) {
        _pendingAcks[messageId]?.completeError('Max retries reached');
        _pendingAcks.remove(messageId);
        _retryCount.remove(messageId);
        _retryTimers.remove(messageId);
        return;
      }

      _retryCount[messageId] = count + 1;
      _send(payload);
      _scheduleRetry(messageId, payload);
    });
  }

  void get(String topic, MessageCallback callback) {
    if (!_initialized) throw Exception('FastPort not initialized. Call init() first.');

    if (!_subscriptions.containsKey(topic)) {
      _subscriptions[topic] = [];
      _send({'type': 'subscribe', 'topic': topic});
    }

    _subscriptions[topic]!.add(callback);
  }

  void unsubscribe(String topic, [MessageCallback? callback]) {
    if (callback != null) {
      _subscriptions[topic]?.remove(callback);
      if (_subscriptions[topic]?.isEmpty ?? false) {
        _subscriptions.remove(topic);
        _send({'type': 'unsubscribe', 'topic': topic});
      }
    } else {
      _subscriptions.remove(topic);
      _send({'type': 'unsubscribe', 'topic': topic});
    }
  }

  void _send(Map<String, dynamic> data) {
    if (_channel != null) {
      _channel!.sink.add(jsonEncode(data));
    }
  }

  void _sendBinary(Uint8List data) {
      if (_channel != null) {
          _channel!.sink.add(data);
      }
  }

  void close() {
    _retryTimers.values.forEach((timer) => timer.cancel());
    _retryTimers.clear();
    _pendingAcks.clear();
    _retryCount.clear();
    _channel?.sink.close();
    _initialized = false;
  }
}

class _IncomingFile {
    final String fileName;
    final int fileSize;
    final int totalChunks;
    final String? topic;
    final List<List<int>> chunks = [];
    
    _IncomingFile({required this.fileName, required this.fileSize, required this.totalChunks, this.topic});
}
