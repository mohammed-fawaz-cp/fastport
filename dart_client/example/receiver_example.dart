import 'package:fastport_client/fastport_client.dart';

void main() async {
  // Initialize FastPort client
  final fastPort = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'mySession',
    password: 'myPassword',
    aesKey: 'your-base64-encoded-32-byte-key-here==',
  );

  try {
    // Connect and authenticate
    await fastPort.init();
    print('Connected to fastPort server');

    // Subscribe to topics
    fastPort.get('sensors/temperature', (message, timestamp) {
      print('Temperature received at $timestamp: $message');
    });

    fastPort.get('sensors/humidity', (message, timestamp) {
      print('Humidity received at $timestamp: $message');
    });

    print('Listening for messages...');

    // Keep alive
    await Future.delayed(Duration(minutes: 10));

    fastPort.close();
  } catch (e) {
    print('Error: $e');
  }
}
