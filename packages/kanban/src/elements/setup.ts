// Runs once for any of the kit's elements: registering the plugin loader is what lets a bare
// element work on the implicit default instance, without any createTessera() call.
import { registerImplicitPlugin } from '@tessera-kit/elements';
// Rich text is shown and edited with the editor kit's elements.
import '@tessera-kit/editor/elements';

registerImplicitPlugin('kanban', () => import('../plugin.js'));
