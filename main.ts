import { 
    App, 
    ButtonComponent, 
    TextComponent, 
    Modal, 
    Notice, 
    Plugin, 
    PluginSettingTab, 
    Setting, 
    MarkdownView,
    htmlToMarkdown
} from 'obsidian';

// @ts-ignore
import pickBy from 'lodash.pickby';
import TurndownService from "turndown";
import got from "got";

interface AddNewArticleSettings {
    articlesFolder: string;
    phpGooseServerURL: string;
}

const DEFAULT_SETTINGS: AddNewArticleSettings = {
    articlesFolder: 'Articles',
    phpGooseServerURL: 'https://google.ie'
}

export default class AddNewArticle extends Plugin {
    settings: AddNewArticleSettings;

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        this.addRibbonIcon('enter', 'Add New Article', () => {
            new NewArticleModal(this.app, this).open();
        });

        this.addSettingTab(new AddNewArticleSettingsClass(this.app, this));
    }

    async processURL(url: string) {
        this.getArticle(url).then((article) => {
            this.createNote(article);
        }).catch((err) => {
            console.error(err);
        });
    }

    onunload() {
        console.log('unloading plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async createNote(article: any) {

        console.log(article);
        const turndownService = new TurndownService();
        let md: string = `
---
Aliases: ["${article.body.title}"]
---

`;

        let tags: string[] = [];
        Object.keys(article.body.entities).forEach((val) => {
            // Strip all punctuation
            val = val.replace(/[^\w\s]|_/g, "")
                     .replace(/\s+/g, " ");

            if ( val.length >= 4 ){
                tags.push(`#${val.toLowerCase()}`)
            }
        });
        let tags_str = tags.join(' ');
        md += tags_str + "\n\n";

        if (htmlToMarkdown) {
          md += htmlToMarkdown(article.body.articleText);
        } else {
          md += turndownService.turndown(article.body.articleText);
        }
    
        if (!md) {
          console.error(`[AddNewArticle] Unable to convert text to Markdown.`);
          return;
        }

        let now = new Date();
        let date_str = [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0')
        ].join('-');
        try {
            let folder_name = `${this.settings.articlesFolder}/${date_str} ${article.body.title}`;
            await this.app.vault.createFolder(folder_name);
            await this.app.vault.create(`${folder_name}/_${article.body.title}.md`, md);
        } catch (error) {
            new Notice(error.toString());
        }
    }

    getActiveView(): MarkdownView {
        return this.app.workspace.getActiveViewOfType(MarkdownView);
    }

    async getArticle(url: string): Promise<string> {
        // @ts-ignore
        return await got.post(this.settings.phpGooseServerURL, {
            json: {
                url: url
            },
            responseType: 'json'
        });
    };
}

class NewArticleModal extends Modal {
    plugin: AddNewArticle;
  
    constructor(app: App, plugin: AddNewArticle) {
      super(app);
      this.plugin = plugin;
    }
  
    onOpen() {
      const { contentEl } = this;
      const urlField = new TextComponent(contentEl).setPlaceholder(
        "URL of note contents"
      );
      urlField.inputEl.id = "pluck-input";
  
      const doAddNewArticle = () => {
        const url = urlField.getValue();
        this.plugin.processURL(url);
        this.close();
      };
  
      const pluckButton = new ButtonComponent(contentEl)
        .setButtonText("Add New Article")
        .onClick(doAddNewArticle);
      pluckButton.buttonEl.id = "pluck-button";
      urlField.inputEl.focus();
      urlField.inputEl.addEventListener("keypress", function (keypressed) {
        if (keypressed.key === "Enter") {
          doAddNewArticle();
        }
      });
    }
  
    onClose() {
      const { contentEl } = this;
      contentEl.empty();
    }
  }

class AddNewArticleSettingsClass extends PluginSettingTab {
    plugin: AddNewArticle;

    constructor(app: App, plugin: AddNewArticle) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Add Article Settings'});

        new Setting(containerEl)
            .setName('Articles Folder')
            .setDesc('Choose the folder for your articles')
            .addDropdown((dropdown) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const files = (this.app.vault.adapter as any).files;
                const folders = pickBy(files, (val: any) => {
                    return val.type === 'folder';
                });
        
                Object.keys(folders).forEach((val) => {
                    dropdown.addOption(val, val);
                });
                return dropdown
                    .setValue(this.plugin.settings.articlesFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.articlesFolder = value;
                        await this.plugin.saveSettings();
                    });
                });;
        
        new Setting(containerEl)
            .setName('PHP-Goose API URL')
            .setDesc('URL for article-extractor server running the php-goose library')
            .addText(text => text
                .setPlaceholder('https://google.ie/')
                .setValue(this.plugin.settings.phpGooseServerURL)
                .onChange(async (value) => {
                    this.plugin.settings.phpGooseServerURL = value;
                    await this.plugin.saveSettings();
                }));
    }
}
