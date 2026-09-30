import {defineConfig} from 'vite';
import {jevPlugin} from './server/jev';
export default defineConfig(({command})=>({
  // GitHub Pages project sites are served from a subpath, so a production build
  // must request assets from /project-hearth/ instead of /. Dev keeps root-relative
  // paths so the loopback Jev plugin and http://127.0.0.1:5173/ are unchanged.
  base: command==='build'?'/project-hearth/':'/',
  plugins:[jevPlugin()],server:{host:'127.0.0.1',port:5173,strictPort:true},preview:{host:'127.0.0.1'}
}));
