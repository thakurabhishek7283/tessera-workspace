// Plain HTML: <script type="module" src="…/@tessera-kit/notes/autoload"></script> registers every tag of
// the kit, and each one downloads the first time an element with that tag appears.
import { lazyDefine } from '@tessera-kit/elements';

lazyDefine('tessera-note', () => import('./elements/tags/tessera-note.js'));
lazyDefine('tessera-notes', () => import('./elements/tags/tessera-notes.js'));
