export type ReviewMode = 'summary' | 'review' | 'tech' | 'action' | 'custom';

export interface ReviewModeConfig {
  id: ReviewMode;
  label: string;
  emoji: string;
  description: string;
  /** 点击快捷按钮时自动发送的用户消息 */
  quickAction: string;
}

export const REVIEW_MODES: Record<ReviewMode, ReviewModeConfig> = {
  summary: {
    id: 'summary',
    label: '快速总结',
    emoji: '⚡',
    description: '提炼核心要点',
    quickAction: '请用 3-5 条要点总结上述内容的核心信息，每条一句话，突出最关键的部分。',
  },
  review: {
    id: 'review',
    label: '深度评审',
    emoji: '🔍',
    description: '查漏补缺，给优化建议',
    quickAction: `请仔细评审上述内容，给出 3-5 条改进建议，按重要程度排序。每条建议必须引用原文（markdown blockquote），便于定位。

格式要求：
> 逐字摘抄的一小段原文

紧跟说明：建议/观察（不要放在 blockquote 里）

如果是缺失内容：
> 【建议补充】一句话描述应该出现但没出现的内容`,
  },
  tech: {
    id: 'tech',
    label: '技术审查',
    emoji: '💻',
    description: '审查可行性和风险',
    quickAction: `请从技术角度审查上述内容，列出技术风险点和改进建议。关注：实现可行性、性能、安全、边界条件、异常处理。每条引用涉及技术实现的原文段落。`,
  },
  action: {
    id: 'action',
    label: '提取任务',
    emoji: '✅',
    description: '提取待办和责任人',
    quickAction: `请提取上述内容中的所有待办事项和行动项，输出结构化任务列表。每个任务包含：
- 任务内容（引用原文）
- 负责人（如未提及标注"待确认"）
- 截止时间（如未提及标注"待确认"）
- 优先级（高/中/低）`,
  },
  custom: {
    id: 'custom',
    label: '自定义',
    emoji: '⚙️',
    description: '自定义指令',
    quickAction: '',
  },
};
