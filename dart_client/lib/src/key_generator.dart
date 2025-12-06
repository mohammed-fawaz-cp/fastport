import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

/// Utility class for generating AES keys
class KeyGenerator {
  /// Generates a random 32-byte (256-bit) AES key
  /// Returns the key as a Base64-encoded string
  static String generateAESKey() {
    final random = Random.secure();
    final bytes = Uint8List.fromList(
      List<int>.generate(32, (_) => random.nextInt(256))
    );
    return base64Encode(bytes);
  }

  /// Validates if a Base64 string is a valid 32-byte AES key
  static bool isValidAESKey(String base64Key) {
    try {
      final bytes = base64Decode(base64Key);
      return bytes.length == 32;
    } catch (e) {
      return false;
    }
  }
}
