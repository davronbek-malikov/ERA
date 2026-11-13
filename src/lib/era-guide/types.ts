export type EraGuideLink = {
  label: string;
  href: string;
};

export type EraGuideAnswer = {
  title: string;
  body: string;
  steps?: string[];
  links?: EraGuideLink[];
};

export type EraGuideFaqEntry = {
  id: string;
  label: string;
  keywords: string[];
  answer: EraGuideAnswer;
};

export type EraGuideQuickAction = {
  id: string;
  label: string;
  prompt: string;
};
