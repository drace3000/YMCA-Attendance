import { getRandomBytes } from 'expo-crypto';

if (!global.crypto) {
  global.crypto = {
    getRandomValues: (
      array: Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array
    ) => {
      const randomBytes = getRandomBytes(array.length);
      array.set(randomBytes);
      return array;
    },
  } as Crypto;
}