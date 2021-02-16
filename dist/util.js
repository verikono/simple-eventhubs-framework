"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onResolvedProp = void 0;
/**
 *
 * @param obj
 * @param key
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