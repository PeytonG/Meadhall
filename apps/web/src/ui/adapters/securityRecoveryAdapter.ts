export {
    adoptCrossSigningWithRecoveryKey,
    attemptAutomaticKeyBackupRestore,
    bootstrapSecretStorageSetup,
    createSecretStorageSetupKey,
    EXISTING_RECOVERY_KEY_MESSAGE,
    getSessionTrust,
    isRecoveryKeyValid,
    restoreKeyBackupWithRecoveryKey,
    restoreKeyBackupWithSecretStorageCredential,
    signThisSessionIfNeeded,
    triggerRoomHistoryDecryption,
} from "../../core/crypto/securityRecoveryFlow";
export type {
    AutomaticRecoveryResult,
    AutomaticRecoveryStatus,
    RecoveryCredentialType,
    SecurityRecoveryFlow,
    SessionTrust,
} from "../../core/crypto/securityRecoveryFlow";
