'use strict';
// PostgreSQL id/pid/rid are int4. Waline's tree formatter compares IDs by
// strict equality. Present a consistent string identity to the reader core,
// while retaining the original adapter and integer database columns.
function readerComment(row){
  const copy={...row};
  for(const key of ['objectId','pid','rid']){
    const value=copy[key];
    if(value===null||value===undefined){if(key==='objectId')throw new TypeError('Invalid reader comment identity');delete copy[key];continue;}
    if(!/^[1-9]\d{0,9}$/.test(String(value))||Number(value)>2147483647)throw new TypeError('Invalid reader comment identity');
    copy[key]=String(value);
  }
  return copy;
}
function createReaderModelView(models){
  if(!models?.Comment||typeof models.Comment.select!=='function'||typeof models.Comment.add!=='function'||typeof models.Comment.count!=='function')throw new TypeError('Invalid reader model');
  return Object.freeze({...models,Comment:Object.freeze({
    async select(...args){return(await models.Comment.select(...args)).map(readerComment);},
    async add(...args){return readerComment(await models.Comment.add(...args));},
    count:(...args)=>models.Comment.count(...args)
  })});
}
module.exports={createReaderModelView};
