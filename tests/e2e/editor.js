// 真正的 Lexical 編輯器（IG、Messenger 這類輸入框使用的同類型編輯器）
import { createEditor, $getRoot } from "lexical";
import { registerPlainText } from "@lexical/plain-text";
import { registerRichText } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";

const mode = new URLSearchParams(location.search).get("mode") || "plain";
const root = document.getElementById("editor");
const editor = createEditor({
  namespace: "thermo-test",
  onError: (e) => {
    throw e;
  },
});
editor.setRootElement(root);
if (mode === "rich") registerRichText(editor);
else registerPlainText(editor);
registerHistory(editor, createEmptyHistoryState(), 300);

// Lexical 內部狀態（不是 DOM）：用來確認「取代」之後編輯器自己也知道文字變了
window.__lexText = "";
editor.registerUpdateListener(({ editorState }) => {
  window.__lexText = editorState.read(() => $getRoot().getTextContent());
});
window.__editor = editor;
