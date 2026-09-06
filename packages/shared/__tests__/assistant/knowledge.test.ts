import { describe, it, expect } from 'vitest';
import {
  slugifyModuleId,
  validateModule,
  validateDocument,
  createModuleMeta,
  createDocumentMeta,
  inferDocType,
  filterEnabledModules,
  searchDocuments,
  sortDocuments,
  exportModuleBundle,
  importModuleBundle,
} from '@qserial/shared';

describe('slugifyModuleId', () => {
  it('中文名称转拼音失败时回退合法 id', () => {
    const id = slugifyModuleId('串口调试');
    expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
  it('英文名称转小写连字符', () => {
    expect(slugifyModuleId('Modbus RTU')).toBe('modbus-rtu');
  });
});

describe('validateModule', () => {
  it('合法模块通过', () => {
    expect(validateModule({ name: 'Modbus', id: 'modbus-rtu' }).ok).toBe(true);
  });
  it('空名称报错', () => {
    expect(validateModule({ name: '  ' }).ok).toBe(false);
  });
  it('非法 ID 报错', () => {
    expect(validateModule({ name: 'x', id: 'Bad ID!' }).ok).toBe(false);
  });
});

describe('validateDocument', () => {
  it('合法文档通过', () => {
    expect(validateDocument({ title: '帧格式', content: '内容' }).ok).toBe(true);
  });
  it('空标题报错', () => {
    expect(validateDocument({ title: '', content: 'x' }).ok).toBe(false);
  });
});

describe('createModuleMeta / createDocumentMeta', () => {
  it('补齐时间戳与默认字段', () => {
    const m = createModuleMeta({ name: 'Modbus' }, 1000);
    expect(m.id).toBe('modbus');
    expect(m.type).toBe('custom');
    expect(m.enabled).toBe(true);
    expect(m.createdAt).toBe(1000);

    const d = createDocumentMeta('modbus', { title: 't', content: '12345' }, 2000);
    expect(d.moduleId).toBe('modbus');
    expect(d.charCount).toBe(5);
  });
});

describe('inferDocType', () => {
  it('识别 md 与 txt', () => {
    expect(inferDocType('a.MD')).toBe('md');
    expect(inferDocType('b.txt')).toBe('txt');
    expect(inferDocType('c.other')).toBe('txt');
  });
});

describe('filterEnabledModules', () => {
  it('仅保留启用模块', () => {
    const mods = [
      createModuleMeta({ name: 'a', id: 'a' }),
      createModuleMeta({ name: 'b', id: 'b' }),
    ];
    mods[1].enabled = false;
    expect(filterEnabledModules(mods).map((m) => m.id)).toEqual(['a']);
  });
});

describe('searchDocuments', () => {
  const docs = [
    createDocumentMeta('m', { title: '帧格式', content: '' }),
    createDocumentMeta('m', { title: 'CRC 计算', content: '' }),
  ];
  it('按关键词过滤', () => {
    expect(searchDocuments(docs, 'crc').map((d) => d.title)).toEqual(['CRC 计算']);
  });
  it('空关键词返回全部', () => {
    expect(searchDocuments(docs, '').length).toBe(2);
  });
});

describe('sortDocuments', () => {
  const docs = [
    createDocumentMeta('m', { title: 'b', content: '' }, 3000),
    createDocumentMeta('m', { title: 'a', content: '' }, 1000),
  ];
  it('按 updatedAt 降序', () => {
    expect(sortDocuments(docs, 'updatedAt')[0].title).toBe('b');
  });
  it('按 title 升序', () => {
    expect(sortDocuments(docs, 'title', true)[0].title).toBe('a');
  });
});

describe('export/import', () => {
  it('往返一致', () => {
    const module = createModuleMeta({ name: 'Modbus', id: 'modbus', type: 'builtin' });
    const docs = [{ meta: createDocumentMeta('modbus', { title: 't', content: '内容' }), content: '内容' }];
    const json = exportModuleBundle(module, docs);
    const restored = importModuleBundle(json);
    expect(restored.module.id).toBe('modbus');
    expect(restored.docs[0].content).toBe('内容');
  });
  it('非法输入抛错', () => {
    expect(() => importModuleBundle('not json')).toThrow();
    expect(() => importModuleBundle(JSON.stringify({ format: 'other' }))).toThrow();
  });
});
