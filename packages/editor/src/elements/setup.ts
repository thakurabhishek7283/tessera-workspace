// Runs once for any of the kit's elements: adds the toolbar icons, and registers the plugin loader,
// which lets a bare element work on the implicit default instance without any createTessera() call.
import { registerImplicitPlugin } from '@tessera-kit/elements';
import { registerEditorIcons } from './icons.js';

registerEditorIcons();
registerImplicitPlugin('editor', () => import('../plugin.js'));
