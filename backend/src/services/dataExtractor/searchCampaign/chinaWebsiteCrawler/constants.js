/**
 * China public-website crawler constants.
 * Discovery source (Baidu/Sogou/…) is not the same as destination website.
 * No new Mongo collection — crawl state lives on RawCapture / RawCaptureEnrichment.
 */

export const DESTINATION_TYPES = Object.freeze({
    MARKETPLACE_LISTING: 'MARKETPLACE_PRODUCT_LISTING',
    COMPANY_WEBSITE: 'COMPANY_WEBSITE',
    COMPANY_PROFILE_DIRECTORY: 'COMPANY_PROFILE_DIRECTORY',
    SEARCH_ENGINE_RESULT: 'SEARCH_ENGINE_RESULT',
    SOCIAL_OTHER: 'SOCIAL_OTHER',
    UNKNOWN: 'UNKNOWN',
});

export const CRAWL_STATUSES = Object.freeze({
    DISCOVERED: 'DISCOVERED',
    QUEUED_FOR_CRAWL: 'QUEUED_FOR_CRAWL',
    CRAWLING: 'CRAWLING',
    CRAWLED: 'CRAWLED',
    CRAWL_BLOCKED: 'CRAWL_BLOCKED',
    CRAWL_FAILED: 'CRAWL_FAILED',
    EXTRACTED: 'EXTRACTED',
});

export const SEARCH_ENGINE_HOSTS = Object.freeze([
    'baidu.com', 'www.baidu.com', 'm.baidu.com',
    'sogou.com', 'www.sogou.com',
    'so.com', 'www.so.com',
    'google.com', 'www.google.com', 'google.com.hk',
    'bing.com', 'www.bing.com',
]);

export const MARKETPLACE_HOSTS = Object.freeze([
    '1688.com', 's.1688.com', 'detail.1688.com',
    'alibaba.com', 'www.alibaba.com',
    'made-in-china.com', 'www.made-in-china.com',
    'globalsources.com', 'www.globalsources.com',
]);

export const DIRECTORY_HOSTS_CN = Object.freeze([
    'tianyancha.com', 'qcc.com', 'qichacha.com', 'aiqicha.baidu.com',
    'gsxt.gov.cn', 'baike.baidu.com',
]);

export const SOCIAL_HOSTS_CN = Object.freeze([
    'weibo.com', 'zhihu.com', 'tieba.baidu.com', 'douyin.com', 'xiaohongshu.com',
]);

export const PAGE_KIND = Object.freeze({
    HOME: 'home',
    ABOUT: 'about',
    CONTACT: 'contact',
    PRODUCTS: 'products',
    PRODUCT_DETAIL: 'product_detail',
    FACTORY: 'factory',
    CERTIFICATION: 'certification',
    OTHER: 'other',
});

export const PRIORITY_LINK_TEXT = Object.freeze([
    '关于我们', '公司简介', '公司介绍', '企业简介', '联系我们', '联系方式',
    '产品中心', '产品展示', '产品', '工厂', '生产', '制造', '资质', '证书', '荣誉',
    '简体中文', '中文版',
    'about', 'about us', 'company', 'company profile', 'contact', 'contact us',
    'products', 'factory', 'manufacturing', 'certificate', 'certification',
]);

export const PRIORITY_PATH_HINTS = Object.freeze([
    '/about', '/about-us', '/aboutus', '/contact', '/contact-us', '/contactus',
    '/company', '/company-profile', '/products', '/product', '/factory',
    '/gsjj', '/gsjs', '/lxwm', '/lianxi', '/chanpin', '/rongyu', '/zizhi',
    '/honor', '/certificate', '/certification', '/manufacturing', '/cn',
]);

export const MANUFACTURER_EVIDENCE_NEEDLES = Object.freeze([
    '厂家', '制造商', '生产厂家', '工厂', '自主生产', '生产基地', '研发生产', '专业生产',
    'manufacturer', 'factory', 'manufacturing', 'production facility',
    'r&d and production', 'oem', 'odm',
]);

export const CJK_RE = /[\u3400-\u9fff]/;

export function chinaCrawlMaxPages() {
    const n = Number(process.env.CHINA_WEBSITE_CRAWL_MAX_PAGES || 8);
    if (!Number.isFinite(n)) return 8;
    return Math.min(10, Math.max(3, Math.floor(n)));
}

export function chinaCrawlDelayMs() {
    const n = Number(process.env.CHINA_WEBSITE_CRAWL_DELAY_MS || 900);
    if (!Number.isFinite(n)) return 900;
    return Math.min(4000, Math.max(400, Math.floor(n)));
}
