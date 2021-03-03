
/**
 * await a variable until it resolves as truthy
 * 
 * @param obj 
 * @param key 
 * 
 * @returns Promise<boolean>
 */
export function onResolvedProp( obj, key ) {

    return new Promise((resolve, reject) => {

        const itvl = setInterval(_ => {
            if(obj[key]){
                clearInterval(itvl);
                resolve(true);
            }
        }, 100);
    });
}