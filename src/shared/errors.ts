import { Data } from "effect";

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
  readonly path: string;
  readonly reason: string;
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string;
  readonly reason: string;
}> {}

export class PermissionDeniedError extends Data.TaggedError(
  "PermissionDeniedError",
)<{
  readonly resource: string;
  readonly reason: string;
}> {}

export class DeviceNotFoundError extends Data.TaggedError(
  "DeviceNotFoundError",
)<{
  readonly deviceId: string;
}> {}

export class RecordingNotFoundError extends Data.TaggedError(
  "RecordingNotFoundError",
)<{
  readonly recordingId: string;
}> {}

export class UpdateCheckError extends Data.TaggedError("UpdateCheckError")<{
  readonly reason: string;
}> {}

export class UpdateDownloadError extends Data.TaggedError(
  "UpdateDownloadError",
)<{
  readonly reason: string;
}> {}

export class UpdateApplyError extends Data.TaggedError("UpdateApplyError")<{
  readonly reason: string;
}> {}

export class ShellCommandError extends Data.TaggedError("ShellCommandError")<{
  readonly command: string;
  readonly reason: string;
}> {}
