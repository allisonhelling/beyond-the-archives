// Emit the PostgreSQL Unicode character class matching the browser's /\p{M}/u.
// Use in a new migration when upgrading the Unicode search contract; changing a
// stored normalization function also requires recomputing generated search text.
const ranges=[]
let start=-1,last=-1
for(let code=0;code<=0x10ffff;code++) {
 if(/\p{M}/u.test(String.fromCodePoint(code))) { if(start<0)start=code;last=code }
 else if(start>=0) { ranges.push([start,last]);start=-1 }
}
if(start>=0)ranges.push([start,last])
const escape=code=>code<=0xffff?'\\'+code.toString(16).padStart(4,'0'):'\\+'+code.toString(16).padStart(6,'0')
console.log('['+ranges.map(([first,last])=>escape(first)+(first===last?'':'-'+escape(last))).join('')+']')
