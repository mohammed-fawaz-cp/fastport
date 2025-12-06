import 'dart:io';
import 'dart:async';
import 'dart:convert';
import 'package:test/test.dart';
import '../lib/src/fastport.dart';

void main() {
  final port = 3001;
  final host = 'ws://127.0.0.1:$port';
  final session = 'e2e_test_session';
  final pass = 'secure_pass';
  final key = base64Encode(List<int>.generate(32, (i) => i));

  group('E2E Integration', () {
    FastPort? clientA;
    FastPort? clientB;
    late File dummyFile;

    setUpAll(() async {
      // 1. Create Dummy File
      dummyFile = File('test_payload.bin');
      final bytes = List<int>.generate(1024, (i) => i % 256);
      await dummyFile.writeAsBytes(bytes);

      // 2. Create Session via API
      final httpClient = HttpClient();
      try {
        final request = await httpClient.post('127.0.0.1', port, '/api/createSession');
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode({
          'sessionName': session,
          'password': pass,
          'retryInterval': 5000,
          'maxRetryLimit': 100,
          'encryptionKey': 'ignore', 
          'messageExpiryTime': 3600000
        }));
        final response = await request.close();
        if (response.statusCode != 200) {
            // It might fail if session exists (400). That's fine.
            if (response.statusCode != 400) {
               final body = await utf8.decoder.bind(response).join();
               throw Exception('Failed to create session: ${response.statusCode} $body');
            }
        }
        print('Session $session ready.');
      } finally {
        httpClient.close();
      }
    });

    tearDownAll(() async {
       if (await dummyFile.exists()) await dummyFile.delete();
       clientA?.close();
       clientB?.close();
    });

    test('Connect and Transfer File', () async {
      // 1. Setup Subscriber (A)
      clientA = FastPort(
        serverUrl: host,
        sessionName: session,
        password: pass,
        aesKey: key
      );
      print('Initializing Client A...');
      try {
        await clientA!.init();
        print('Client A Connected');
      } catch (e) {
        print('Client A Init Failed: $e');
        rethrow;
      }

      // 2. Setup Publisher (B)
      clientB = FastPort(
        serverUrl: host,
        sessionName: session,
        password: pass,
        aesKey: key
      );
      print('Initializing Client B...');
      try {
        await clientB!.init();
        print('Client B Connected');
      } catch (e) {
         print('Client B Init Failed: $e');
         rethrow;
      }

      // 3. Setup Listener on A
      final completer = Completer<List<int>>();
      clientA!.onFile('test/files', (name, data) {
         print('Client A Received File: $name (${data.length} bytes)');
         completer.complete(data);
      });

      // 4. Send File from B
      print('Client B Sending File to topic test/files...');
      print('File Size: ${await dummyFile.length()} bytes');
      await Future.delayed(Duration(seconds: 1)); 
      
      try {
        await clientB!.sendFile(dummyFile.path, 'test/files');
        print('File Sent');
      } catch (e) {
        print('Send Failed: $e');
        rethrow;
      }

      // 5. Verify
      print('Waiting for reception...');
      final receivedData = await completer.future.timeout(Duration(seconds: 5));
      expect(receivedData.length, 1024);
      expect(receivedData[0], 0);
      expect(receivedData.last, 1023 % 256);
      print('Verification Success');
    });
  });
}
