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
