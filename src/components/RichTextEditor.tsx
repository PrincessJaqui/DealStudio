import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { useEffect, useState } from 'react';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  Link as LinkIcon,
  Heading1,
  Heading2,
  Heading3,
  Minimize2,
  Maximize2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Ghost-selection plugin
//
// When the link toolbar opens, the URL <input> takes browser focus, which makes
// the editor's text selection visually disappear. The user can no longer see
// which text they're about to wrap with a link — bad UX. ProseMirror still
// holds the selection range internally, so the link is applied correctly,
// but the visual feedback is gone.
//
// Solution: a Tiptap extension that draws an inline decoration over a stored
// range. When the link UI opens we set { active: true, from, to } via meta;
// when it closes we clear it. The decoration class gives that range a visible
// background regardless of which element has DOM focus.
// ─────────────────────────────────────────────────────────────────────────────
const ghostSelectionKey = new PluginKey<{ active: boolean; from: number; to: number }>('ghostSelection');

const GhostSelection = Extension.create({
  name: 'ghostSelection',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostSelectionKey,
        state: {
          init: () => ({ active: false, from: 0, to: 0 }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(ghostSelectionKey);
            if (meta) return meta;
            // Map stored positions through any document changes so they stay valid
            if (prev.active) {
              return { active: true, from: tr.mapping.map(prev.from), to: tr.mapping.map(prev.to) };
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const ghost = ghostSelectionKey.getState(state);
            if (!ghost?.active || ghost.from === ghost.to) return null;
            return DecorationSet.create(state.doc, [
              Decoration.inline(ghost.from, ghost.to, { class: 'rt-ghost-selection' }),
            ]);
          },
        },
      }),
    ];
  },
});

interface RichTextEditorProps {
  value: string;                    // HTML string (or plain text — gets wrapped as paragraphs)
  onChange: (html: string) => void; // Receives HTML output
  placeholder?: string;
}

/**
 * Convert a plain-text string (no HTML tags) into safe HTML paragraphs so the
 * editor can render it. If the input already looks like HTML, leave it alone.
 */
function plainToHtml(input: string): string {
  if (!input) return '';
  // If the value already has tags, treat as HTML
  if (/<[a-z][\s\S]*>/i.test(input)) return input;
  // Plain text: split on blank lines for paragraphs, single newlines become <br>
  const paras = input.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return paras.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  // Track empty state in React so the placeholder reactively hides when content is typed.
  // editor.isEmpty exists, but Tiptap doesn't trigger re-renders when it changes — we drive it ourselves.
  const [isEmpty, setIsEmpty] = useState(true);
  const [linkUrl, setLinkUrl] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] }, // H1 = largest, H2 = heading, H3 = subheading
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
      }),
      Underline,
      GhostSelection,
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank', class: 'text-[#503DBB] underline' },
      }),
    ],
    content: plainToHtml(value),
    editorProps: {
      attributes: {
        class: 'prose-sm max-w-none focus:outline-none px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Treat empty editor as truly empty so the placeholder shows / save logic clears properly
      onChange(html === '<p></p>' ? '' : html);
      setIsEmpty(editor.isEmpty);
    },
  });

  // Sync external value changes (e.g., editing existing event, draft restore)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = plainToHtml(value);
    // Avoid resetting cursor on every keystroke — only update when truly different
    if (incoming !== current && !(incoming === '' && current === '<p></p>')) {
      editor.commands.setContent(incoming, false);
    }
    // Always re-evaluate isEmpty after mount or value change so the placeholder
    // hides on initial render when value is non-empty (otherwise the initial
    // useState(true) leaves the placeholder visible behind real content).
    setIsEmpty(editor.isEmpty);
  }, [value, editor]);

  if (!editor) return null;

  const clearGhostSelection = () => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(ghostSelectionKey, { active: false, from: 0, to: 0 }));
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      let url = linkUrl.trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    clearGhostSelection();
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const ToolbarBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`h-8 w-8 flex items-center justify-center rounded-md text-sm transition-colors ${
        active ? 'bg-[#503DBB] text-white' : 'text-[#364153] hover:bg-[#f3f4f6]'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white overflow-hidden focus-within:border-[#503DBB] focus-within:ring-1 focus-within:ring-[#503DBB] transition-colors flex flex-col">
      {/* Toolbar — stays at top of editor while content scrolls below */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#e5e7eb] bg-[#fafafa] flex-wrap shrink-0">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1 (largest)">
          <Heading1 className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
          <Heading2 className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
          <Heading3 className="w-4 h-4" />
        </ToolbarBtn>
        <span className="w-px h-5 bg-[#e5e7eb] mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
          <BoldIcon className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
          <ItalicIcon className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarBtn>
        <span className="w-px h-5 bg-[#e5e7eb] mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
          <ListIcon className="w-4 h-4" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => {
            const opening = !showLinkInput;
            const existing = editor.getAttributes('link').href || '';
            setLinkUrl(existing);
            if (opening) {
              // Capture current selection so the user can SEE which text will be linked
              // even after focus moves to the URL input.
              const { from, to } = editor.state.selection;
              if (from !== to) {
                editor.view.dispatch(editor.state.tr.setMeta(ghostSelectionKey, { active: true, from, to }));
              }
            } else {
              clearGhostSelection();
            }
            setShowLinkInput(opening);
          }}
          active={editor.isActive('link')}
          title="Link"
        >
          <LinkIcon className="w-4 h-4" />
        </ToolbarBtn>

        {/* Minimize / expand — pushed to the far right */}
        <div className="ml-auto">
          <ToolbarBtn
            onClick={() => setIsMinimized(v => !v)}
            title={isMinimized ? 'Expand description' : 'Minimize description'}
          >
            {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
          </ToolbarBtn>
        </div>
      </div>

      {/* Inline link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-2 py-2 border-b border-[#e5e7eb] bg-[#fafafa] shrink-0">
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); } if (e.key === 'Escape') { clearGhostSelection(); setShowLinkInput(false); setLinkUrl(''); } }}
            placeholder="https://example.com"
            className="flex-1 h-8 px-2 text-sm rounded-md border border-[#e5e7eb] focus:outline-none focus:border-[#503DBB]"
            autoFocus
          />
          <button type="button" onClick={handleAddLink} className="h-8 px-3 text-xs font-medium rounded-md bg-gradient-to-br from-[#242473] to-[#503DBB] text-white hover:bg-[#242473]">
            {linkUrl.trim() ? 'Apply' : 'Remove'}
          </button>
          <button type="button" onClick={() => { clearGhostSelection(); setShowLinkInput(false); setLinkUrl(''); }} className="h-8 px-3 text-xs font-medium rounded-md text-[#6a7282] hover:bg-[#f3f4f6]">
            Cancel
          </button>
        </div>
      )}

      {/* Editor surface — scrollable so toolbar stays visible */}
      <div
        className="relative overflow-y-auto"
        style={{
          minHeight: isMinimized ? 60 : 160,
          maxHeight: isMinimized ? 60 : 320,
        }}
      >
        <EditorContent editor={editor} />
        {isEmpty && placeholder && (
          <p className="absolute top-2 left-3 text-sm text-[#9ca3af] pointer-events-none">{placeholder}</p>
        )}
      </div>

      {/* Editor content styles — paragraph spacing 12px, headings, lists, links */}
      <style>{`
        .ProseMirror { font-size: 14px; line-height: 1.55; color: #191f1d; }
        .ProseMirror p { margin: 0 0 12px 0; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px 0; line-height: 1.3; }
        .ProseMirror h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px 0; line-height: 1.35; }
        .ProseMirror h3 { font-size: 16px; font-weight: 600; margin: 12px 0 6px 0; line-height: 1.4; }
        .ProseMirror h1:first-child, .ProseMirror h2:first-child, .ProseMirror h3:first-child { margin-top: 0; }
        .ProseMirror ul { list-style-type: disc; padding-left: 1.25rem; margin: 0 0 12px 0; }
        .ProseMirror ul li { margin: 0 0 2px 0; }
        .ProseMirror ul li p { margin: 0; }
        .ProseMirror a { color: #503DBB; text-decoration: underline; }
        .ProseMirror strong { font-weight: 700; }
        .ProseMirror em { font-style: italic; }
        .ProseMirror u { text-decoration: underline; }
        /* Ghost-selection — keeps the user's text selection visible while the URL input is focused */
        .rt-ghost-selection { background-color: rgba(118, 178, 82, 0.30); border-radius: 2px; }
      `}</style>
    </div>
  );
}

/**
 * Sanitizing renderer for stored description HTML on display screens.
 * Allows: p, br, strong, em, u, ul, li, h2, h3, a (with safe href).
 * Strips: scripts, iframes, event handlers, javascript: URLs, etc.
 */
export function RichTextRenderer({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeRichText(html);
  return (
    <>
      <div className={`rich-text-content ${className || ''}`} dangerouslySetInnerHTML={{ __html: safe }} />
      <style>{`
        .rich-text-content { overflow-wrap: anywhere; word-break: break-word; }
        .rich-text-content p { margin: 0 0 12px 0; }
        .rich-text-content p:empty::before { content: "\u00a0"; }
        .rich-text-content p:last-child { margin-bottom: 0; }
        .rich-text-content h1 { font-size: 22px; font-weight: 700; margin: 16px 0 8px 0; color: #191f1d; line-height: 1.3; }
        .rich-text-content h2 { font-size: 18px; font-weight: 700; margin: 14px 0 6px 0; color: #191f1d; line-height: 1.35; }
        .rich-text-content h3 { font-size: 16px; font-weight: 600; margin: 12px 0 6px 0; color: #191f1d; line-height: 1.4; }
        .rich-text-content h1:first-child, .rich-text-content h2:first-child, .rich-text-content h3:first-child { margin-top: 0; }
        .rich-text-content ul { list-style-type: disc; padding-left: 1.25rem; margin: 0 0 12px 0; }
        .rich-text-content ul li { margin: 0 0 2px 0; }
        .rich-text-content ul li p { margin: 0; }
        .rich-text-content a { color: #503DBB; text-decoration: underline; overflow-wrap: anywhere; word-break: break-word; }
        .rich-text-content strong { font-weight: 700; }
        .rich-text-content em { font-style: italic; }
        .rich-text-content u { text-decoration: underline; }
      `}</style>
    </>
  );
}

const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'LI', 'H1', 'H2', 'H3', 'A', 'SPAN']);

export function sanitizeRichText(html: string): string {
  if (!html) return '';
  // If it doesn't contain tags, treat as plain text and convert
  if (!/<[a-z][\s\S]*>/i.test(html)) return plainToHtml(html);

  // Use DOMParser to walk the tree and strip disallowed tags/attrs
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];
  let node = walker.nextNode() as Element | null;
  while (node) {
    const tag = node.tagName;
    if (!ALLOWED_TAGS.has(tag)) {
      toRemove.push(node);
    } else {
      // Strip all attributes except safe ones on <a>
      const attrs = Array.from(node.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        if (tag === 'A' && name === 'href') {
          const v = attr.value.trim().toLowerCase();
          if (v.startsWith('javascript:') || v.startsWith('data:') || v.startsWith('vbscript:')) {
            node.removeAttribute(attr.name);
          }
        } else if (tag === 'A' && (name === 'target' || name === 'rel')) {
          // Allow target / rel on links
        } else {
          node.removeAttribute(attr.name);
        }
      }
      // Force safe rel on links
      if (tag === 'A') {
        node.setAttribute('rel', 'noopener noreferrer');
        node.setAttribute('target', '_blank');
      }
    }
    node = walker.nextNode() as Element | null;
  }
  // Replace disallowed nodes with their text content
  toRemove.forEach(el => {
    const text = doc.createTextNode(el.textContent || '');
    el.parentNode?.replaceChild(text, el);
  });
  return doc.body.innerHTML;
}

/** Strip all HTML tags for a plain-text preview (used in card snippets). */
export function stripHtml(html: string): string {
  if (!html) return '';
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
}
