import 'package:fastport_client/fastport_client.dart';

void main() async {
  // Initialize FastPort client
  final fastPort = FastPort(
    serverUrl: 'ws://localhost:3000',
    sessionName: 'mySession',
    password: 'myPassword',
    aesKey: 'your-base64-encoded-32-byte-key-here==',
    retryInterval: 5000,
    maxRetries: 100,
  );

  try {
    // Connect and authenticate
    await fastPort.init();
    print('Connected to fastPort server');

    // Publish messages
    await fastPort.emit('sensors/temperature', '{"value": 25.5, "unit": "C"}');
    print('Message sent to sensors/temperature');

    await fastPort.emit('sensors/humidity', '{"value": 60, "unit": "%"}');
    print('Message sent to sensors/humidity');

    // Keep alive for a bit
    await Future.delayed(Duration(seconds: 5));

    fastPort.close();
  } catch (e) {
    print('Error: $e');
  }
}
