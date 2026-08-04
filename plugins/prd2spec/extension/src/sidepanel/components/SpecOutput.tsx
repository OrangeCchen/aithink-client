import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  spec: string;
  isStreaming: boolean;
  screenshots?: string[];
}

export function SpecOutput({ spec, isStreaming, screenshots = [] }: Props) {
  if (!spec) {
    return (
      <div className="text-xs text-gray-400 italic p-4 text-center">
        点击上方"生成功规"按钮开始
      </div>
    );
  }

  return (
    <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded p-3 text-[13px] leading-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: (props) => <h2 className="text-base font-semibold mt-4 mb-2" {...props} />,
          h3: (props) => <h3 className="text-sm font-semibold mt-3 mb-1.5" {...props} />,
          h4: (props) => <h4 className="text-sm font-medium mt-2 mb-1" {...props} />,
          ul: (props) => <ul className="list-disc pl-5 my-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 my-1" {...props} />,
          li: (props) => <li className="my-0.5" {...props} />,
          code: (props) => (
            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs" {...props} />
          ),
          table: (props) => (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th className="border border-gray-300 px-2 py-1 bg-gray-50 text-left" {...props} />
          ),
          td: (props) => <td className="border border-gray-300 px-2 py-1 align-top" {...props} />,
          img: ({ src, alt, ...rest }) => {
            const m = typeof src === 'string' ? /^prd2spec:\/\/shot\/(\d+)$/.exec(src) : null;
            if (m) {
              const idx = Number(m[1]);
              const shot = screenshots[idx];
              if (!shot) {
                return (
                  <span className="text-[11px] text-orange-600">[设计稿{idx}缺失]</span>
                );
              }
              return (
                <img
                  src={shot}
                  alt={alt || `设计稿${idx}`}
                  className="my-2 max-w-full rounded border border-gray-200"
                  {...rest}
                />
              );
            }
            return <img src={src} alt={alt} {...rest} />;
          },
        }}
      >
        {spec}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse align-middle ml-0.5" />
      )}
    </div>
  );
}
