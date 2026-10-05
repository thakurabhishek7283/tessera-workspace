// Plain HTML: <script type="module" src="…/@tessera-kit/editor/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-editor', () => import('./elements/tags/tessera-editor.js'));
lazyDefine('tessera-rich-text', () => import('./elements/tags/tessera-rich-text.js'));
