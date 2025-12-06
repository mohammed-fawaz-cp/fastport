import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:pointycastle/export.dart';

class CryptoUtils {
  final String aesKey;
  late final Uint8List _keyBytes;

  CryptoUtils(this.aesKey) {
    _keyBytes = base64Decode(aesKey);
    if (_keyBytes.length != 32) {
      throw Exception('AES key must be 32 bytes (256-bit)');
    }
  }

  String encryptMessage(String message) {
    final random = Random.secure();
    final iv = Uint8List.fromList(
      List<int>.generate(16, (_) => random.nextInt(256))
    );

    final cipher = CBCBlockCipher(AESEngine())
      ..init(
        true,
        ParametersWithIV(KeyParameter(_keyBytes), iv),
      );

    final messageBytes = utf8.encode(message);
    final paddedMessage = _addPadding(messageBytes);
    final encrypted = _processBlocks(cipher, paddedMessage);

    return '${base64Encode(iv)}:${base64Encode(encrypted)}';
  }

  String decryptMessage(String encryptedData) {
    final parts = encryptedData.split(':');
    if (parts.length != 2) {
      throw Exception('Invalid encrypted data format');
    }

    final iv = base64Decode(parts[0]);
    final encrypted = base64Decode(parts[1]);

    final cipher = CBCBlockCipher(AESEngine())
      ..init(
        false,
        ParametersWithIV(KeyParameter(_keyBytes), iv),
      );

    final decrypted = _processBlocks(cipher, encrypted);
    final unpadded = _removePadding(decrypted);

    return utf8.decode(unpadded);
  }

  Uint8List encryptBytes(Uint8List data) {
    final random = Random.secure();
    final iv = Uint8List.fromList(
      List<int>.generate(16, (_) => random.nextInt(256))
    );

    final cipher = CBCBlockCipher(AESEngine())
      ..init(
        true,
        ParametersWithIV(KeyParameter(_keyBytes), iv),
      );

    final paddedData = _addPadding(data);
    final encrypted = _processBlocks(cipher, paddedData);

    // Return format: IV (16B) + Encrypted Payload
    final result = Uint8List(iv.length + encrypted.length);
    result.setAll(0, iv);
    result.setAll(iv.length, encrypted);
    return result;
  }

  Uint8List decryptBytes(Uint8List encryptedData) {
    if (encryptedData.length < 16) {
      throw Exception('Invalid encrypted data length');
    }

    final iv = encryptedData.sublist(0, 16);
    final encrypted = encryptedData.sublist(16);

    final cipher = CBCBlockCipher(AESEngine())
      ..init(
        false,
        ParametersWithIV(KeyParameter(_keyBytes), iv),
      );

    final decrypted = _processBlocks(cipher, encrypted);
    return _removePadding(decrypted);
  }

  Uint8List _addPadding(List<int> data) {
    final blockSize = 16;
    final padding = blockSize - (data.length % blockSize);
    return Uint8List.fromList([
      ...data,
      ...List<int>.filled(padding, padding),
    ]);
  }

  Uint8List _removePadding(Uint8List data) {
    final padding = data.last;
    return data.sublist(0, data.length - padding);
  }

  Uint8List _processBlocks(BlockCipher cipher, Uint8List data) {
    final output = Uint8List(data.length);
    for (var offset = 0; offset < data.length; offset += cipher.blockSize) {
      cipher.processBlock(data, offset, output, offset);
    }
    return output;
  }

  String generateHash(String data) {
    final bytes = utf8.encode(data);
    final digest = sha256.convert(bytes);
    return digest.toString();
  }

  bool verifyHash(String data, String hash) {
    return generateHash(data) == hash;
  }
}
