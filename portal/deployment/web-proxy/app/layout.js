import {createElement} from 'react';
export const metadata={title:'Growthcast staging',robots:{index:false,follow:false}};
export default function Layout({children}){return createElement('html',{lang:'en'},createElement('body',null,children));}
