import { useEffect, useMemo, useState } from "react";
import type {
  ExamAttemptState,
  ExamModuleAdapter,
  PersistedSpeakingResponse,
  SpeakingQuestion,
} from "../types";
import { formatDuration } from "../utils";
import { useSpeakingRecorder } from "../useSpeakingRecorder";

interface SpeakingRecorderProps {
  question: SpeakingQuestion;
  attempt: ExamAttemptState;
  adapter: ExamModuleAdapter;
  persisted?: PersistedSpeakingResponse;
  onPersisted: (response: PersistedSpeakingResponse) => void;
}

export function SpeakingRecorder({
  question,
  attempt,
  adapter,
  persisted,
  onPersisted,
}: SpeakingRecorderProps) {
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const recorder = useSpeakingRecorder({
    maxDurationSeconds: question.maxDurationSeconds,
  });

  useEffect(() => {
    if (!persisted) return;
    if (persisted.status === "uploaded") {
      setUploadError("");
    }
  }, [persisted]);

  const handleStop = async () => {
    const result = await recorder.stopRecording();
    if (!result) return;
    setUploadError("");
    setIsUploading(true);
    onPersisted({
      questionId: question.id,
      status: "uploading",
      updatedAt: new Date().toISOString(),
      durationSeconds: result.durationSeconds,
    });

    try {
      const initResponse = await adapter.initSpeakingUpload({
        attemptId: attempt.attemptId,
        examVersionKey: attempt.examVersionKey,
        questionId: question.id,
        mimeType: result.mimeType,
        byteSize: result.blob.size,
      });

      await adapter.uploadSpeakingBlob(
        {
          uploadUrl: initResponse.uploadUrl,
          uploadMethod: initResponse.uploadMethod,
          uploadHeaders: initResponse.uploadHeaders,
        },
        result.blob,
      );

      const completed = await adapter.completeSpeakingUpload({
        attemptId: attempt.attemptId,
        examVersionKey: attempt.examVersionKey,
        questionId: question.id,
        responseId: initResponse.responseId,
        durationSeconds: result.durationSeconds,
        mimeType: result.mimeType,
        byteSize: result.blob.size,
      });

      onPersisted({
        questionId: question.id,
        responseId: completed.responseId,
        storageKey: completed.storageKey,
        durationSeconds: result.durationSeconds,
        status: "uploaded",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Speaking upload failed.";
      setUploadError(message);
      onPersisted({
        questionId: question.id,
        status: "error",
        errorMessage: message,
        durationSeconds: result.durationSeconds,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (isUploading) return "Uploading";
    if (recorder.status === "recording") return "Recording";
    if (persisted?.status === "uploaded") return "Saved";
    if (persisted?.status === "error" || uploadError || recorder.status === "error") return "Retry needed";
    return "Ready";
  }, [isUploading, persisted?.status, recorder.status, uploadError]);

  return (
    <div className="te-speaking">
      <div className="te-speaking__body">
        <div className="te-speaking__status">
          <span className={`te-status te-status--${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>{statusLabel}</span>
          <span className="te-speaking__timer">
            {formatDuration(recorder.durationSeconds)} / {formatDuration(question.maxDurationSeconds)}
          </span>
        </div>

        <div className="te-speaking__actions">
          <button
            type="button"
            className="te-button te-button--primary"
            onClick={() => void recorder.startRecording()}
            disabled={recorder.status === "recording" || isUploading}
          >
            Kayda Başla
          </button>
          <button
            type="button"
            className="te-button"
            onClick={() => void handleStop()}
            disabled={recorder.status !== "recording"}
          >
            Durdur
          </button>
          <button
            type="button"
            className="te-button"
            onClick={recorder.clearRecording}
            disabled={recorder.status === "recording" || isUploading}
          >
            Yeniden Kaydet
          </button>
        </div>

        {recorder.audioUrl ? (
          <audio className="te-speaking__audio" controls src={recorder.audioUrl}>
            Tarayıcınız ses oynatmayı desteklemiyor.
          </audio>
        ) : null}

        {recorder.errorMessage ? <p className="te-error">{recorder.errorMessage}</p> : null}
        {uploadError ? <p className="te-error">{uploadError}</p> : null}
      </div>
    </div>
  );
}
