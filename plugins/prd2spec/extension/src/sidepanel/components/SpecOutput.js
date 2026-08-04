import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
export function SpecOutput({ spec, isStreaming, screenshots = [] }) {
    if (!spec) {
        return (_jsx("div", { className: "text-xs text-gray-400 italic p-4 text-center", children: "\u70B9\u51FB\u4E0A\u65B9\"\u751F\u6210\u529F\u89C4\"\u6309\u94AE\u5F00\u59CB" }));
    }
    return (_jsxs("div", { className: "prose prose-sm max-w-none bg-white border border-gray-200 rounded p-3 text-[13px] leading-6", children: [_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], components: {
                    h2: (props) => _jsx("h2", { className: "text-base font-semibold mt-4 mb-2", ...props }),
                    h3: (props) => _jsx("h3", { className: "text-sm font-semibold mt-3 mb-1.5", ...props }),
                    h4: (props) => _jsx("h4", { className: "text-sm font-medium mt-2 mb-1", ...props }),
                    ul: (props) => _jsx("ul", { className: "list-disc pl-5 my-1", ...props }),
                    ol: (props) => _jsx("ol", { className: "list-decimal pl-5 my-1", ...props }),
                    li: (props) => _jsx("li", { className: "my-0.5", ...props }),
                    code: (props) => (_jsx("code", { className: "bg-gray-100 px-1 py-0.5 rounded text-xs", ...props })),
                    table: (props) => (_jsx("div", { className: "overflow-x-auto my-2", children: _jsx("table", { className: "border-collapse text-xs", ...props }) })),
                    th: (props) => (_jsx("th", { className: "border border-gray-300 px-2 py-1 bg-gray-50 text-left", ...props })),
                    td: (props) => _jsx("td", { className: "border border-gray-300 px-2 py-1 align-top", ...props }),
                    img: ({ src, alt, ...rest }) => {
                        const m = typeof src === 'string' ? /^prd2spec:\/\/shot\/(\d+)$/.exec(src) : null;
                        if (m) {
                            const idx = Number(m[1]);
                            const shot = screenshots[idx];
                            if (!shot) {
                                return (_jsxs("span", { className: "text-[11px] text-orange-600", children: ["[\u8BBE\u8BA1\u7A3F", idx, "\u7F3A\u5931]"] }));
                            }
                            return (_jsx("img", { src: shot, alt: alt || `设计稿${idx}`, className: "my-2 max-w-full rounded border border-gray-200", ...rest }));
                        }
                        return _jsx("img", { src: src, alt: alt, ...rest });
                    },
                }, children: spec }), isStreaming && (_jsx("span", { className: "inline-block w-2 h-4 bg-blue-500 animate-pulse align-middle ml-0.5" }))] }));
}
