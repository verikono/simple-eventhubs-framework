
/**
 * 
 * @param obj 
 * @param key 
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