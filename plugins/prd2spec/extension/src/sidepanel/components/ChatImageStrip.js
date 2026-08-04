import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ChatImageStrip({ images, onRemove }) {
    if (images.length === 0)
        return null;
    return (_jsx("div", { className: "flex flex-wrap gap-1.5 mb-1.5", children: images.map((img) => (_jsxs("div", { className: "relative group border border-gray-200 rounded overflow-hidden bg-white", children: [_jsx("img", { src: img.dataUrl, alt: "\u7C98\u8D34\u56FE", className: "h-12 w-12 object-cover" }), _jsx("button", { type: "button", onClick: () => onRemove(img.id), className: "absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl opacity-0 group-hover:opacity-100", title: "\u79FB\u9664", children: "\u00D7" })] }, img.id))) }));
}
