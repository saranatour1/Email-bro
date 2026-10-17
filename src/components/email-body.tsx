import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const textToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

// StarterKit has no image node and drops anything outside its schema, so scripts, styles and tracking pixels never render.
const extensions = [
  StarterKit.configure({
    link: { openOnClick: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
  }),
]

export const EmailBody = ({ html, text }: { html: string | null; text: string }) => {
  const editor = useEditor({ extensions, content: html ?? textToHtml(text), editable: false, immediatelyRender: false })
  return <EditorContent editor={editor} className="prose prose-sm max-w-none break-words dark:prose-invert" />
}
