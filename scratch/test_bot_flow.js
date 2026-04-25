
// Simulación avanzada del flujo de Casa Le Bistro para terminal
function simulateCasaLeBistro() {
    console.log("=== SIMULACIÓN TERMINAL: CASA LE BISTRO ===");

    const nodes = [
        { id: 'start_1', type: 'start', data: { label: 'Inicio', message: '¡Hola! Bienvenido a Casa Le Bistro. 👋' } },
        { id: 'menu_1', type: 'menu', data: { label: 'Categorías', message: 'Selecciona una categoría:', options: [{ id: 'opt_hamb', text: 'Hamburguesas' }] } },
        { id: 'hamb_menu', type: 'menu', data: { label: 'Hamburguesas', message: 'Elige tu hamburguesa:', options: [{ id: 'prod_1', text: 'Bistecca Bianca ($22.900)', value: 'p1|22900' }] } },
        { id: 'qty_q', type: 'question', data: { label: 'Cantidad', message: '¿Cuántas unidades deseas?', variable: 'cantidad' } },
        { id: 'notes_q', type: 'question', data: { label: 'Notas', message: '¿Alguna solicitud especial?', variable: 'notas' } },
        { id: 'decision', type: 'menu', data: { label: 'Continuar', message: '¿Cómo deseas continuar?', options: [{ id: 'opt_finish', text: 'Finalizar pedido' }] } },
        { id: 'name_q', type: 'question', data: { label: 'Nombre', message: '¿Cuál es tu nombre completo?', variable: 'customer_name' } },
        { id: 'phone_q', type: 'question', data: { label: 'Teléfono', message: 'Gracias {{customer_name}}, ¿teléfono?', variable: 'phone' } },
        { id: 'addr_q', type: 'question', data: { label: 'Dirección', message: '¿Dirección de entrega?', variable: 'direccion_entrega' } },
        { id: 'instr_q', type: 'question', data: { label: 'Instrucciones', message: '¿Instrucciones adicionales?', variable: 'notas_entrega' } },
        { id: 'action_reg', type: 'action', data: { label: 'Registrar', actionType: 'register_order' } },
        { id: 'end_node', type: 'end', data: { label: 'Fin', message: '¡Pedido registrado con éxito para {{customer_name}} en {{direccion_entrega}}!' } }
    ];

    const connections = [
        { from: 'start_1', fromPort: 'output', to: 'menu_1' },
        { from: 'menu_1', fromPort: 'opt_hamb', to: 'hamb_menu' },
        { from: 'hamb_menu', fromPort: 'prod_1', to: 'qty_q' },
        { from: 'qty_q', fromPort: 'output', to: 'notes_q' },
        { from: 'notes_q', fromPort: 'output', to: 'decision' },
        { from: 'decision', fromPort: 'opt_finish', to: 'name_q' },
        { from: 'name_q', fromPort: 'output', to: 'phone_q' },
        { from: 'phone_q', fromPort: 'output', to: 'addr_q' },
        { from: 'addr_q', fromPort: 'output', to: 'instr_q' },
        { from: 'instr_q', fromPort: 'output', to: 'action_reg' },
        { from: 'action_reg', fromPort: 'output', to: 'end_node' }
    ];

    let currentNodeId = 'start_1';
    let waitingFor = null;
    let variables = { cart: [] };
    const inputs = ["1", "1", "2", "Sin cebolla", "1", "Ricardo", "314999", "Calle 123 Norte", "Cerca al parque"];

    function process(inputText) {
        if (inputText) console.log(`\n👤 Usuario: ${inputText}`);
        
        if (waitingFor === 'input') {
            const node = nodes.find(n => n.id === currentNodeId);
            variables[node.data.variable] = inputText;
            const conn = connections.find(c => c.from === currentNodeId && c.fromPort === 'output');
            currentNodeId = conn ? conn.to : null;
            waitingFor = null;
        } else if (waitingFor === 'menu_selection') {
            const node = nodes.find(n => n.id === currentNodeId);
            const opt = node.data.options[parseInt(inputText) - 1];
            if (opt) {
                const conn = connections.find(c => c.from === currentNodeId && c.fromPort === opt.id);
                currentNodeId = conn ? conn.to : null;
                waitingFor = null;
            }
        }

        let loops = 0;
        while (currentNodeId && loops < 15) {
            loops++;
            const node = nodes.find(n => n.id === currentNodeId);
            if (!node) { console.log("ERROR: Nodo no encontrado"); break; }

            if (node.data.message) {
                let msg = node.data.message;
                for (let k in variables) msg = msg.replace(`{{${k}}}`, variables[k]);
                console.log(`🤖 Bot: ${msg}`);
            }

            if (node.type === 'question') { waitingFor = 'input'; break; }
            if (node.type === 'menu') { 
                waitingFor = 'menu_selection'; 
                node.data.options.forEach((o, i) => console.log(`   ${i+1}. ${o.text}`));
                break; 
            }
            if (node.type === 'action') {
                console.log(`[ACTION] Ejecutando: ${node.data.actionType}`);
                if (node.data.actionType === 'register_order') variables.orderNumber = "#12345";
            }
            if (node.type === 'end') { console.log("🏁 FIN"); currentNodeId = null; break; }

            const conn = connections.find(c => c.from === currentNodeId && c.fromPort === 'output');
            currentNodeId = conn ? conn.to : null;
        }
    }

    process(""); // Trigger inicio
    inputs.forEach(i => process(i));
}

simulateCasaLeBistro();
