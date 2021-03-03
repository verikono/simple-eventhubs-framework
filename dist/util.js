"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onResolvedProp = void 0;
/**
 * await a variable until it resolves as truthy
 *
 * @param obj
 * @param key
 *
 * @returns Promise<boolean>
 */
function onResolvedProp(obj, key) {
    return new Promise((resolve, reject) => {
        const itvl = setInterval(_ => {
            if (obj[key]) {
                clearInterval(itvl);
                resolve(true);
            }
        }, 100);
    });
}
exports.onResolvedProp = onResolvedProp;
//# sourceMappingURL=util.js.map