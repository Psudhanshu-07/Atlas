import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  children: string;
  className?: string;
}

/** Shared markdown renderer (narrative, explanations, generated docs). */
export default function Markdown({ children, className = "" }: Props) {
  if (!children?.trim()) return null;
  return (
    <div className={`md ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}