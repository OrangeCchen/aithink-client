// 从剪贴板/拖拽事件中读取图片，返回 dataURL 列表
export function extractImagesFromClipboard(items) {
    if (!items)
        return Promise.resolve([]);
    const promises = [];
    for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
                promises.push(new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (evt) => resolve(evt.target?.result || null);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                }));
            }
        }
    }
    return Promise.all(promises).then((arr) => arr.filter((s) => !!s));
}
export function genImageId() {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
