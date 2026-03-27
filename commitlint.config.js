/**
 * Commitlint 配置 - 强制中文提交信息
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'subject-contains-chinese': (parsed) => {
          const { subject } = parsed;
          if (!subject) {
            return [false, '提交信息不能为空'];
          }
          const hasChinese = /[\u4e00-\u9fa5]/.test(subject);
          return [
            hasChinese,
            hasChinese
              ? ''
              : '❌ 提交信息必须使用中文！\n\n正确示例:\n  feat: 添加新功能\n  fix: 修复某个问题\n  docs: 更新文档',
          ];
        },
      },
    },
  ],
  rules: {
    'subject-contains-chinese': [2, 'always'],
  },
};
