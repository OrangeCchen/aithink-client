import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
export function DesignUpload({ onImagesChange }) {
    const [images, setImages] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const pasteAreaRef = useRef(null);
    useEffect(() => {
        onImagesChange(images);
    }, [images, onImagesChange]);
    const addImage = (dataUrl) => {
        const newImage = {
            id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            dataUrl,
            timestamp: Date.now(),
        };
        setImages((prev) => [...prev, newImage]);
    };
    const removeImage = (id) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
    };
    const handlePaste = async (e) => {
        const items = e.clipboardData?.items;
        if (!items)
            return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        if (evt.target?.result) {
                            addImage(evt.target.result);
                        }
                    };
                    reader.readAsDataURL(file);
                }
            }
        }
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) {
                    addImage(evt.target.result);
                }
            };
            reader.readAsDataURL(file);
        });
    };
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) {
                    addImage(evt.target.result);
                }
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };
    useEffect(() => {
        const area = pasteAreaRef.current;
        if (!area)
            return;
        area.addEventListener('paste', handlePaste);
        return () => area.removeEventListener('paste', handlePaste);
    }, []);
    return (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { ref: pasteAreaRef, onDrop: handleDrop, onDragOver: (e) => {
                    e.preventDefault();
                    setIsDragging(true);
                }, onDragLeave: () => setIsDragging(false), tabIndex: 0, className: `border-2 border-dashed rounded p-4 text-center transition-colors ${isDragging
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-gray-50'}`, children: [_jsxs("div", { className: "text-xs text-gray-600 mb-2", children: ["\u70B9\u51FB\u6B64\u533A\u57DF\uFF0C\u7136\u540E\u6309 ", _jsx("kbd", { className: "px-1 py-0.5 bg-white border border-gray-300 rounded text-[10px]", children: "Ctrl+V" }), " \u7C98\u8D34\u622A\u56FE"] }), _jsx("div", { className: "text-[11px] text-gray-400 mb-2", children: "\u6216\u62D6\u62FD\u56FE\u7247\u5230\u6B64\u5904" }), _jsxs("label", { className: "inline-block text-xs px-3 py-1.5 bg-white border border-gray-300 rounded cursor-pointer hover:bg-gray-100", children: ["\u9009\u62E9\u6587\u4EF6", _jsx("input", { type: "file", accept: "image/*", multiple: true, onChange: handleFileSelect, className: "hidden" })] })] }), images.length > 0 && (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "text-xs text-gray-600", children: ["\u5DF2\u6DFB\u52A0 ", images.length, " \u5F20\u56FE\u7247"] }), _jsx("div", { className: "grid grid-cols-2 gap-2", children: images.map((img) => (_jsxs("div", { className: "relative group border border-gray-200 rounded overflow-hidden bg-white", children: [_jsx("img", { src: img.dataUrl, alt: "\u8BBE\u8BA1\u7A3F", className: "w-full h-32 object-contain" }), _jsx("button", { type: "button", onClick: () => removeImage(img.id), className: "absolute top-1 right-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity", children: "\u5220\u9664" })] }, img.id))) })] }))] }));
}
