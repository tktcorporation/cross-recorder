/**
 * electrobun/view のブラウザプレビュー用モック。
 * Vite dev server でUI確認する際に使用。RPC呼び出しは全てno-opになる。
 * 本番ビルドでは使われない（vite.config.ts の resolve.alias で dev 時のみ有効）。
 */

const noopProxy = new Proxy(
  {},
  {
    get: () => () =>
      Promise.resolve({
        platform: "browser-preview",
        nativeSystemAudioAvailable: false,
        success: true,
        recordings: [],
        data: "",
        mimeType: "",
        version: "0.0.0-preview",
        channel: "dev",
        updateAvailable: false,
      }),
  },
);

const rpcMock = {
  request: noopProxy,
  send: noopProxy,
};

export class Electroview {
  static defineRPC() {
    return rpcMock;
  }
  constructor() {}
}

export default { Electroview };
