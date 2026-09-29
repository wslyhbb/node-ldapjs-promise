import {
    stat, mkdir, readdir, copyFile, rm, readFile, writeFile
} from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import Slugger from 'github-slugger';
import fm from 'front-matter';
import hljs from 'highlight.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));

marked.use({
    highlight: (code, lang) => {
        if (lang) {
            return hljs.highlight(code, { language: lang }).value;
        }

        return code;
    }
});

function tocHTML(toc) {
    let html = '<ul>\n';
    for (const li of toc) {
        html += '<li>\n';
        html += `<div>\n<a href="#${li.slug}">${li.text}</a>\n</div>\n`;
        if (li.children && li.children.length > 0) {
            html += tocHTML(li.children);
        }
        html += '</li>\n';
    }
    html += '</ul>\n';

    return html;
}

function markdownTOC(markdown) {
    const tokens = marked.lexer(markdown);
    const slugger = new Slugger();
    const toc = [];
    let currentHeading;
    let ignoreFirst = true;
    for (const token of tokens) {
        if (token.type === 'heading') {
            if (token.depth === 1) {
                if (ignoreFirst) {
                    ignoreFirst = false;
                    continue;
                };
                currentHeading = {
                    text: token.text,
                    slug: slugger.slug(token.text),
                    children: []
                };
                toc.push(currentHeading);
            } else if (token.depth === 2) {
                if (!currentHeading) {
                    continue;
                }
                currentHeading.children.push({
                    text: token.text,
                    slug: slugger.slug(token.text)
                });
            }
        }
    }

    return {
        toc: tocHTML(toc),
        html: marked.parser(tokens)
    };
}

function createHTML(template, text) {
    const { attributes, body } = fm(text);

    const { toc, html } = markdownTOC(body);
    attributes.toc_html = toc;
    attributes.content = html;

    for (const prop in attributes) {
        template = template.replace(new RegExp(`%\\(${prop}\\)s`, 'ig'), attributes[prop]);
    }

    return template;
}

async function copyRecursive(src, dest) {
    const stats = await stat(src);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
        await mkdir(dest);
        const files = await readdir(src);
        for (const file of files) {
            await copyRecursive(join(src, file), join(dest, file));
        }
    } else {
        await copyFile(src, dest);
    }
}

async function createDocs() {
    const docs = resolve(scriptDir, '..', 'docs')
    const dist = resolve(scriptDir, '..', 'public')
    const branding = join(docs, 'branding')
    const src = join(branding, 'public')

    try {
        await rm(dist, { recursive: true });
    } catch (ex) {
        if (ex.code !== 'ENOENT') {
            throw ex;
        }
    }
    await copyRecursive(src, dist);

    const highlightjsStyles = resolve(scriptDir, '..', 'node_modules', 'highlight.js', 'styles')
    await copyFile(join(highlightjsStyles, 'default.css'), join(dist, 'media', 'css', 'highlight.css'));

    const template = await readFile(join(branding, 'template.html'), { encoding: 'utf8' });
    const files = await readdir(docs);
    for (const file of files) {
        if (!file.endsWith('.md')) {
            continue
        }
        const text = await readFile(join(docs, file), { encoding: 'utf8' });
        const html = createHTML(template, text);

        await writeFile(join(dist, file.replace(/md$/, 'html')), html);
    }
}

createDocs().catch(ex => {
    console.error(ex);
    process.exitCode = 1;
});
