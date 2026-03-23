import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { useEffect } from 'react';

const TOOLBAR_BTN = "rounded-[10px] border border-[#DDD3C5] bg-[#FFFDF9] px-2 py-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] text-[#485A53] transition hover:border-[#BFAE95] hover:bg-white disabled:opacity-40";
const TOOLBAR_BTN_ACTIVE = "rounded-[10px] border border-[#2C5447] bg-[#EEF6F0] px-2 py-1 font-['Neutraface_2_Text:Demi',sans-serif] text-[11px] text-[#2C5447]";

export default function RichTextToolbar({
  content,
  onChange,
  placeholder = 'Soru metnini yazın...',
}: {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: true }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "min-h-[120px] px-4 py-3 font-['Neutraface_2_Text:Book',sans-serif] text-[14px] text-[#1C2A24] leading-[1.7] outline-none focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Resim URL:');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#DDD4C6] bg-[#FFFCF7] transition focus-within:border-[#9F865C] focus-within:ring-4 focus-within:ring-[#EEE3CC]">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 border-b border-[#ECE2D5] bg-[#FBF7F0] px-3 py-2">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>B</button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>I</button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>S</button>
        <span className="mx-1 w-px bg-[#E4DBCF]" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>H3</button>
        <span className="mx-1 w-px bg-[#E4DBCF]" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>UL</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}>OL</button>
        <span className="mx-1 w-px bg-[#E4DBCF]" />
        <button type="button" onClick={addImage} className={TOOLBAR_BTN}>IMG</button>
      </div>
      {/* Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}
