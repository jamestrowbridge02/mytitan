import { ApiError } from "./api";

type ResendVerificationResponse = {
  ok?: boolean;
  status?: "sent" | "accepted" | "already_verified" | "delivery_unavailable" | "delivery_failed";
  message?: string;
  actionHref?: string;
};

export function getResendVerificationMessage(result: ResendVerificationResponse | null | undefined) {
  if (result?.message) {
    return result.message;
  }
  if (result?.status === "already_verified") {
    return "This email is already verified.";
  }
  return "If the address still needs verification, we will send a new email shortly.";
}

export function getSafeVerificationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.statusCode === 429) {
      return "You have requested too many verification emails. Try again shortly.";
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "Sign in again, then request a new verification email.";
    }
  }
  return "We could not process the verification email request just now. Try again in a moment.";
}
