// CSS の side-effect import (`import "./index.css"`) を許可する宣言。
// 取り込みはバンドラ (Vite) が担うため型情報は不要だが、
// TypeScript は宣言のない非コードモジュールの import をエラーにするため必要。
declare module "*.css";
