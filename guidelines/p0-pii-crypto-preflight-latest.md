# P0 PII Crypto Preflight

- Generated (UTC): 2026-03-21T07:10:12.153Z
- Status: PASS

## Checks

- pii_crypto_strict_enabled: PASS (PII_CRYPTO_STRICT=true)
- pii_lookup_hmac_key_present: PASS (PII_LOOKUP_HMAC_KEY is set.)
- pii_kms_encrypted_data_key_present: PASS (PII_KMS_ENCRYPTED_DATA_KEY_B64 is set.)
- pii_kms_region_present: PASS (PII_KMS_REGION/AWS_REGION is set.)
- pii_kms_key_id_present: PASS (PII_KMS_KEY_ID is set.)
- kms_decrypt_data_key: PASS (KMS decrypt succeeded with context #2.)
- exam_api_start_pii_runtime: PASS (HTTP 200 (session start succeeded).)

