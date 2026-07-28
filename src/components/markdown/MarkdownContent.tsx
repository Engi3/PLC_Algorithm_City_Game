import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

/** Renders Markdown with this app's Tailwind zinc/blue styling, so guide docs and AI-generated text share one look. */
export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSlug]}
      components={{
        h1: (props) => (
          <h1 className="mb-3 mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50" {...props} />
        ),
        h2: (props) => (
          <h2
            className="mb-2 mt-8 border-b border-zinc-200 pb-1 text-xl font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50"
            {...props}
          />
        ),
        h3: (props) => (
          <h3 className="mb-1 mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50" {...props} />
        ),
        p: (props) => <p className="mb-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300" {...props} />,
        ul: (props) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300" {...props} />
        ),
        ol: (props) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300" {...props} />
        ),
        li: (props) => <li className="leading-relaxed" {...props} />,
        strong: (props) => <strong className="font-semibold text-zinc-900 dark:text-zinc-50" {...props} />,
        a: (props) => <a className="text-blue-600 hover:underline dark:text-blue-400" {...props} />,
        blockquote: (props) => (
          <blockquote
            className="mb-3 border-l-4 border-blue-300 pl-3 text-sm italic text-zinc-600 dark:border-blue-800 dark:text-zinc-400"
            {...props}
          />
        ),
        hr: () => <hr className="my-6 border-zinc-200 dark:border-zinc-800" />,
        code: (props) => (
          <code
            className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
            {...props}
          />
        ),
        table: (props) => (
          <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[480px] text-left text-sm" {...props} />
          </div>
        ),
        thead: (props) => (
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400" {...props} />
        ),
        tbody: (props) => <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800" {...props} />,
        th: (props) => <th className="px-3 py-2" {...props} />,
        td: (props) => <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
