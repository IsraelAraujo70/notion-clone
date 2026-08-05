use std::collections::HashMap;

use aes_gcm::aead::{Aead, Payload};
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngCore;
use rand::rngs::OsRng;
use uuid::Uuid;

use crate::application::ports::google_calendar::{
    EncryptedSecret, PlainSecret, SecretCipher, SecretCipherError,
};

const NONCE_BYTES: usize = 12;
const KEY_BYTES: usize = 32;

pub struct AesGcmSecretCipher {
    active_key_id: String,
    keys: HashMap<String, [u8; KEY_BYTES]>,
}

impl AesGcmSecretCipher {
    pub fn from_encoded_keys(value: &str) -> Result<Self, SecretCipherError> {
        let mut keys = HashMap::new();
        let mut active_key_id = None;
        for entry in value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let (key_id, encoded) = entry.split_once(':').ok_or(SecretCipherError::InvalidKey)?;
            if key_id.is_empty() || key_id.len() > 64 || keys.contains_key(key_id) {
                return Err(SecretCipherError::InvalidKey);
            }
            let decoded = URL_SAFE_NO_PAD
                .decode(encoded)
                .map_err(|_| SecretCipherError::InvalidKey)?;
            let key: [u8; KEY_BYTES] = decoded
                .try_into()
                .map_err(|_| SecretCipherError::InvalidKey)?;
            active_key_id.get_or_insert_with(|| key_id.to_string());
            keys.insert(key_id.to_string(), key);
        }
        Ok(Self {
            active_key_id: active_key_id.ok_or(SecretCipherError::InvalidKey)?,
            keys,
        })
    }

    fn aad(owner_id: Uuid) -> String {
        format!("reason:google-calendar:refresh-token:{owner_id}")
    }
}

impl SecretCipher for AesGcmSecretCipher {
    fn encrypt(
        &self,
        owner_id: Uuid,
        secret: &PlainSecret,
    ) -> Result<EncryptedSecret, SecretCipherError> {
        let key = self
            .keys
            .get(&self.active_key_id)
            .ok_or(SecretCipherError::InvalidKey)?;
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| SecretCipherError::InvalidKey)?;
        let mut nonce_bytes = [0_u8; NONCE_BYTES];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce =
            Nonce::try_from(nonce_bytes.as_slice()).map_err(|_| SecretCipherError::Unexpected)?;
        let ciphertext = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: secret.expose().as_bytes(),
                    aad: Self::aad(owner_id).as_bytes(),
                },
            )
            .map_err(|_| SecretCipherError::Unexpected)?;
        let mut envelope = Vec::with_capacity(NONCE_BYTES + ciphertext.len());
        envelope.extend_from_slice(&nonce_bytes);
        envelope.extend_from_slice(&ciphertext);
        Ok(EncryptedSecret {
            key_id: self.active_key_id.clone(),
            ciphertext: URL_SAFE_NO_PAD.encode(envelope),
        })
    }

    fn decrypt(
        &self,
        owner_id: Uuid,
        secret: &EncryptedSecret,
    ) -> Result<PlainSecret, SecretCipherError> {
        let key = self
            .keys
            .get(&secret.key_id)
            .ok_or(SecretCipherError::InvalidKey)?;
        let envelope = URL_SAFE_NO_PAD
            .decode(&secret.ciphertext)
            .map_err(|_| SecretCipherError::InvalidCiphertext)?;
        if envelope.len() <= NONCE_BYTES {
            return Err(SecretCipherError::InvalidCiphertext);
        }
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| SecretCipherError::InvalidKey)?;
        let nonce = Nonce::try_from(&envelope[..NONCE_BYTES])
            .map_err(|_| SecretCipherError::InvalidCiphertext)?;
        let plaintext = cipher
            .decrypt(
                &nonce,
                Payload {
                    msg: &envelope[NONCE_BYTES..],
                    aad: Self::aad(owner_id).as_bytes(),
                },
            )
            .map_err(|_| SecretCipherError::InvalidCiphertext)?;
        String::from_utf8(plaintext)
            .map(PlainSecret::new)
            .map_err(|_| SecretCipherError::InvalidCiphertext)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encoded(byte: u8) -> String {
        URL_SAFE_NO_PAD.encode([byte; KEY_BYTES])
    }

    #[test]
    fn encrypts_with_aad_and_decrypts_after_key_rotation() {
        let owner = Uuid::new_v4();
        let first = AesGcmSecretCipher::from_encoded_keys(&format!("old:{}", encoded(7))).unwrap();
        let encrypted = first
            .encrypt(owner, &PlainSecret::new("refresh-token-plaintext".into()))
            .unwrap();
        assert_eq!(encrypted.key_id, "old");
        assert!(!encrypted.ciphertext.contains("refresh-token-plaintext"));
        assert!(first.decrypt(Uuid::new_v4(), &encrypted).is_err());

        let rotated = AesGcmSecretCipher::from_encoded_keys(&format!(
            "new:{},old:{}",
            encoded(9),
            encoded(7)
        ))
        .unwrap();
        assert_eq!(
            rotated.decrypt(owner, &encrypted).unwrap().expose(),
            "refresh-token-plaintext"
        );
        assert_eq!(
            rotated
                .encrypt(owner, &PlainSecret::new("next".into()))
                .unwrap()
                .key_id,
            "new"
        );
    }

    #[test]
    fn debug_output_never_contains_secrets() {
        let plain = PlainSecret::new("do-not-log".into());
        let encrypted = EncryptedSecret {
            key_id: "key-1".into(),
            ciphertext: "ciphertext-value".into(),
        };
        assert_eq!(format!("{plain:?}"), "[redacted]");
        let output = format!("{encrypted:?}");
        assert!(!output.contains("ciphertext-value"));
        assert!(!output.contains("do-not-log"));
    }
}
