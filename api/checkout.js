const https = require('https');

module.exports = async (req, res) => {
    // Configuração de Headers CORS para permitir chamadas do frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Se for requisição OPTIONS (Pre-flight), apenas retorna sucesso
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Permitir apenas requisições POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Método não permitido. Use POST.' });
    }

    const { name, email, phone, plano, orderbumps } = req.body || {};

    // Validar campos obrigatórios
    if (!name || !email || !phone || !plano) {
        return res.status(400).json({ success: false, message: 'Por favor, preencha todos os campos (nome, e-mail, telefone e plano).' });
    }

    // Tabela de Preços e Nomes dos Planos Rígida no Servidor (Protegida contra manipulação)
    const tabelaPlanos = {
        basico: {
            nome: 'Plano Básico',
            precoCents: 1000 // R$ 10,00
        },
        pro: {
            nome: 'Plano PRO',
            precoCents: 2490 // R$ 24,90
        },
        pro_desconto: {
            nome: 'Plano PRO (Oferta Especial)',
            precoCents: 1790 // R$ 17,90
        },
        pro_maximo_desconto: {
            nome: 'Plano PRO (Super Desconto)',
            precoCents: 1590 // R$ 15,90
        }
    };

    // Validar se o plano selecionado existe na tabela
    const planoSelecionado = tabelaPlanos[plano];
    if (!planoSelecionado) {
        return res.status(400).json({ success: false, message: 'Plano selecionado é inválido.' });
    }

    // Tabela de Preços dos Order Bumps (Protegida contra manipulação no Servidor)
    const tabelaOrderBumps = {
        vade_mecum: {
            nome: 'Vade Mecum Digital + Atualizações',
            precoCents: 1490 // R$ 14,90
        },
        cronograma: {
            nome: 'Do Zero à Aprovação - Cronograma Completo',
            precoCents: 990 // R$ 9,90
        },
        questoes: {
            nome: '+5000 questões comentadas OAB',
            precoCents: 790 // R$ 7,90
        }
    };

    // Calcular valor total da transação e juntar descrições dos itens selecionados
    let valorTotalCents = planoSelecionado.precoCents;
    let itensAdquiridos = [`Manual do Estudante de Direito - ${planoSelecionado.nome}`];

    if (Array.isArray(orderbumps)) {
        orderbumps.forEach(obId => {
            const obInfo = tabelaOrderBumps[obId];
            if (obInfo) {
                valorTotalCents += obInfo.precoCents;
                itensAdquiridos.push(obInfo.nome);
            }
        });
    }

    // Credenciais da API da Paradise Pags (Ocultas com segurança no Servidor)
    const apiKey = 'sk_442210ea27466a39a787b9cd791c0d93c3f374bfb9eea4443dd0656a319ddb23';

    // Montar payload de envio para a Paradise Pags
    const payload = JSON.stringify({
        amount: valorTotalCents,
        description: itensAdquiridos.join(' + '),
        reference: `MED-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
        customer: {
            name: name,
            email: email,
            phone: phone.replace(/\D/g, '')
        },
        source: 'api_externa'
    });

    // Fazer requisição HTTPS nativa do Node.js (evita dependências externas como Axios ou node-fetch)
    try {
        const transaction = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'multi.paradisepags.com',
                port: 443,
                path: '/api/v1/transaction.php',
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout: 30000
            };

            const request = https.request(options, (response) => {
                let body = '';
                response.setEncoding('utf8');
                
                response.on('data', (chunk) => {
                    body += chunk;
                });
                
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        if (response.statusCode >= 400) {
                            reject(new Error(parsed.message || `Erro HTTP ${response.statusCode}`));
                        } else {
                            resolve(parsed);
                        }
                    } catch (e) {
                        reject(new Error('Resposta inválida do gateway de pagamentos.'));
                    }
                });
            });

            request.on('error', (e) => {
                reject(e);
            });

            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Tempo limite de conexão esgotado.'));
            });

            request.write(payload);
            request.end();
        });

        // Retornar sucesso com dados da transação
        return res.status(200).json(transaction);

    } catch (error) {
        console.error("Erro Paradise API:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || 'Erro de conexão com o processador de pagamentos.' 
        });
    }
};
