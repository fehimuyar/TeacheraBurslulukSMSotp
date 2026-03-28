import type {
  ExamModuleAdapter,
  ResultStatusResponse,
  SaveObjectiveAnswersPayload,
  SpeakingUploadCompletePayload,
  SpeakingUploadCompleteResponse,
  SpeakingUploadInitPayload,
  SpeakingUploadInitResponse,
  SubmitExamPayload,
  SubmitExamResponse,
} from "./types";

export interface HttpExamAdapterConfig {
  baseUrl: string;
  sessionToken?: string;
  headers?: Record<string, string>;
  endpoints?: Partial<{
    saveObjectiveAnswers: string;
    initSpeakingUpload: string;
    completeSpeakingUpload: string;
    submitExam: string;
    resultStatus: string;
  }>;
}

const DEFAULT_ENDPOINTS = {
  saveObjectiveAnswers: "/api/exam/session/answer",
  initSpeakingUpload: "/api/exam/session/speaking/init",
  completeSpeakingUpload: "/api/exam/session/speaking/complete",
  submitExam: "/api/exam/session/submit",
  resultStatus: "/api/exam/session/result-status",
} as const;

function resolveUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function createHttpExamAdapter(config: HttpExamAdapterConfig): ExamModuleAdapter {
  const endpoints = { ...DEFAULT_ENDPOINTS, ...(config.endpoints ?? {}) };
  const baseHeaders = {
    Accept: "application/json",
    ...(config.headers ?? {}),
    ...(config.sessionToken ? { "x-exam-session-token": config.sessionToken } : {}),
  };

  return {
    async saveObjectiveAnswers(payload: SaveObjectiveAnswersPayload): Promise<void> {
      const response = await fetch(resolveUrl(config.baseUrl, endpoints.saveObjectiveAnswers), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      await parseResponse(response);
    },

    async initSpeakingUpload(payload: SpeakingUploadInitPayload): Promise<SpeakingUploadInitResponse> {
      const response = await fetch(resolveUrl(config.baseUrl, endpoints.initSpeakingUpload), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return parseResponse<SpeakingUploadInitResponse>(response);
    },

    async uploadSpeakingBlob(target, blob): Promise<void> {
      const response = await fetch(target.uploadUrl, {
        method: target.uploadMethod ?? "PUT",
        headers: target.uploadHeaders,
        body: blob,
      });
      if (!response.ok) {
        throw new Error(`upload_failed_${response.status}`);
      }
    },

    async completeSpeakingUpload(
      payload: SpeakingUploadCompletePayload,
    ): Promise<SpeakingUploadCompleteResponse> {
      const response = await fetch(resolveUrl(config.baseUrl, endpoints.completeSpeakingUpload), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return parseResponse<SpeakingUploadCompleteResponse>(response);
    },

    async submitExam(payload: SubmitExamPayload): Promise<SubmitExamResponse> {
      const response = await fetch(resolveUrl(config.baseUrl, endpoints.submitExam), {
        method: "POST",
        headers: {
          ...baseHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      const parsed = await parseResponse<
        SubmitExamResponse & {
          result?: {
            status?: string;
            final_score_100?: number | null;
          };
        }
      >(response);

      if (parsed && typeof parsed === "object" && typeof parsed.status === "string") {
        return parsed;
      }

      const backendStatus = String(parsed?.result?.status || "").trim().toUpperCase();
      return {
        status: backendStatus === "PUBLISHED" || backendStatus === "VIEWED"
          ? "finalized"
          : "evaluation_pending",
        finalScore:
          typeof parsed?.result?.final_score_100 === "number"
            ? parsed.result.final_score_100
            : undefined,
      };
    },

    async getResultStatus(attemptId: string): Promise<ResultStatusResponse> {
      const endpoint = new URL(resolveUrl(config.baseUrl, endpoints.resultStatus));
      endpoint.searchParams.set("attemptId", attemptId);
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        headers: baseHeaders,
      });
      return parseResponse<ResultStatusResponse>(response);
    },
  };
}
