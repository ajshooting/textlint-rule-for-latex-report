import type { TextlintRuleModule } from '@textlint/types';
import { dictionary } from './dictionary';

export interface Options {
    // If node's text includes allowed text, does not report.
    allows?: string[];
}

// 範囲指定！あとついか
// キャプションとかの空欄検知
// subsectionとか他のも完全一致検索したい
//

const report: TextlintRuleModule<Options> = (context, options = {}) => {
    const { Syntax, RuleError, report, getSource, locator } = context;
    const allows = options.allows ?? [];

    let fullText: string;

    return {
        [Syntax.Document](node) {
            // 文書内のすべての文字列
            fullText = getSource(node);

            // キャプションの完全一致
            const captionRegex = /\\caption\{(.*?)\}/g;
            const captionMatches = Array.from(fullText.matchAll(captionRegex));
            const seenCaptions = new Set<string>();
            for (const match of captionMatches) {
                const captionText = match[1];
                const index = match.index ?? 0;
                const matchRange = [index, index + match[0].length] as const;
                if (seenCaptions.has(captionText)) {
                    const ruleError = new RuleError(`重複したキャプション: "${captionText}"`, {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                } else {
                    seenCaptions.add(captionText);
                }
            }

            // 任意タグ内の完全一致
            // const captionRegex = /\\(\w*?)\{(.*?)\}/g;
            // const captionMatches = Array.from(fullText.matchAll(captionRegex));
            // const seenCaptions = new Set<string>();
            // for (const match of captionMatches) {
            //     const captionText = match[1];
            //     const index = match.index ?? 0;
            //     const matchRange = [index, index + match[0].length] as const;
            //     if (seenCaptions.has(captionText)) {
            //         const ruleError = new RuleError(`重複したキャプション: "${captionText}"`, {
            //             padding: locator.range(matchRange),
            //         });
            //         report(node, ruleError);
            //     } else {
            //         seenCaptions.add(captionText);
            //     }
            // }

            // $...$と\(...\)の混在
            const mixedMathMatches = [...fullText.matchAll(/\$(.*?)\$/g)];
            const mathParenMatches = [...fullText.matchAll(/\\\((.*?)\\\)/g)];
            const mixedMathCount = mixedMathMatches.length;
            const mathParenCount = mathParenMatches.length;
            if (mixedMathCount > 0 && mathParenCount > 0) {
                const isMixedMathFewer = mixedMathCount <= mathParenCount;
                const targetMatches = isMixedMathFewer ? mixedMathMatches : mathParenMatches;
                const message = `\\(...\\) と $...$ が混在しています。(${mathParenCount}回 / ${mixedMathCount}回)`;
                targetMatches.forEach((match) => {
                    const index = match.index ?? 0;
                    const matchRange = [index, index + match[0].length] as const;
                    const ruleError = new RuleError(message, {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                });
            }
        },
        [Syntax.Str](node) {
            // "Str" node
            const text = getSource(node); // Get text
            if (allows.some((allow) => text.includes(allow))) {
                return;
            }

            // empty{}
            const emptyRegex = /\{\}/g;
            const emptyMatches = Array.from(text.matchAll(emptyRegex));
            for (const match of emptyMatches) {
                const index = match.index ?? 0;
                const matchRange = [index, index + match[0].length] as const;
                const ruleError = new RuleError('空欄になっています。', {
                    padding: locator.range(matchRange),
                });
                report(node, ruleError);
            }

            // 斜体になっていない可能性が高い文字
            const variableRegex = /[ぁ-んァ-ヶｱ-ﾝﾞﾟ一-龥々ー、。\.,\s]([a-zA-Z])[ぁ-んァ-ヶｱ-ﾝﾞﾟ一-龥々ー、。\.,\s]/g;
            const variableMatches = Array.from(text.matchAll(variableRegex));
            for (const match of variableMatches) {
                const index = match.index ?? 0;
                const matchRange = [index, index + match[1].length] as const;
                const ruleError = new RuleError('斜体にしていない可能性が高い文字: ' + match[1], {
                    padding: locator.range(matchRange),
                });
                report(node, ruleError);
            }
            // ↑表の一番上のところ斜体にしないがちだからそこも一緒に
            // フィルターで大文字小文字制御する？でDとか斜体の時あるし..

            // OAばーとかの立体

            // キャプションなしとか

            // 単位チェック(有無、空間、)
            // これもめんどくさそう、本当に

            // 表の有効数字チェック
            // これめっちゃめんどくさそう！

            // \times 10^n とかも考慮する？かっこつきで！

            // 不確かさの有効数字チェック(小数点以下の桁数)
            const pmRegex = /(\d+)\.?(\d*)\s*(?:\\pm|\\mp)\s*(\d+)\.?(\d*)/g;
            const pmMatches = Array.from(text.matchAll(pmRegex));
            for (const match of pmMatches) {
                const index = match.index ?? 0;
                // 小数点以下の桁数が一致していない
                if (match[2].length !== match[4].length) {
                    const matchRange = [index, index + match[0].length] as const;
                    const ruleError = new RuleError('小数点以下の桁数が揃っていません。', {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                }
                // 有効数字とり過ぎ
                const lastDigit = match[4].replace(/^0+/, '');
                if ((match[3] == '0' && lastDigit.length > 2) || (match[3] !== '0' && match[4].length > 2)) {
                    const matchRange = [index, index + match[0].length] as const;
                    const ruleError = new RuleError('有効数字を取り過ぎているかもしれません :' + lastDigit.length, {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                }
                // 整数部分が大きすぎ
                if (match[1].length > 2 && match[3].length > 2) {
                    const matchRange = [index, index + match[0].length] as const;
                    const ruleError = new RuleError('*10^nという表現を使いましょう', {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                }
            }

            // 辞書
            dictionary.forEach(({ incorrect, correct }) => {
                const regex = new RegExp(incorrect, 'g');
                const matches = text.matchAll(regex);
                for (const match of matches) {
                    const index = match.index ?? 0;
                    const matchRange = [index, index + match[0].length] as const;
                    const ruleError = new RuleError(`"${incorrect}" -?> "${correct}"`, {
                        padding: locator.range(matchRange),
                    });
                    report(node, ruleError);
                }
            });
        },
    };
};

export default report;
