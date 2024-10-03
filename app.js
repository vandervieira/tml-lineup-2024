// app.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Pool } = require('pg');
const path = require('path');
const schedule = require('./schedule'); // Importando os dados da programação
const bodyParser = require('body-parser'); // Adicionado para parsear o corpo das requisições
const http = require('http');
const { Server } = require("socket.io");

const app = express();

// Configuração do Banco de Dados
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Testando a conexão com o banco
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Erro ao conectar ao banco', err);
    }
    console.log('Conectado ao banco de dados');
    release();
});

// Configuração da Sessão
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
}));

// Inicializando o Passport
app.use(passport.initialize());
app.use(passport.session());

// Configurando EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Estratégia do Passport para Google OAuth
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Verificar se o usuário já está no banco
            const res = await pool.query('SELECT * FROM public.users WHERE google_id = $1', [profile.id]);
            let user;
            if (res.rows.length > 0) {
                user = res.rows[0];
            } else {
                // Inserir novo usuário com photo_url
                const photoUrl = profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null;
                const insertRes = await pool.query(
                    'INSERT INTO public.users (google_id, email, name, photo_url) VALUES ($1, $2, $3, $4) RETURNING *',
                    [profile.id, profile.emails[0].value, profile.displayName, photoUrl]
                );
                user = insertRes.rows[0];
            }
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    }
));

// Serializar usuário
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Desserializar usuário
passport.deserializeUser(async (id, done) => {
    try {
        const res = await pool.query('SELECT * FROM public.users WHERE id = $1', [id]);
        done(null, res.rows[0]);
    } catch (err) {
        done(err, null);
    }
});

// Middleware para verificar autenticação
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Criando o servidor HTTP e o Socket.io
const server = http.createServer(app);
const io = new Server(server);

// Configuração do Socket.io
io.on('connection', (socket) => {
    console.log('Um usuário conectado');

    socket.on('disconnect', () => {
        console.log('Usuário desconectado');
    });
});

// Rotas

// Página Inicial com Programação e Interações Condicionais
app.get('/', async (req, res) => {
    try {
        // Obter artistas e contagem de seleções e usuários que selecionaram
        const artistsRes = await pool.query(`
            SELECT a.artist_name, COUNT(a.user_id) as count,
                   json_agg(json_build_object('id', u.id, 'name', u.name, 'photo_url', u.photo_url)) AS users
            FROM public.artist_selections a
            JOIN public.users u ON a.user_id = u.id
            GROUP BY a.artist_name
            ORDER BY a.artist_name
        `);

        // Criar um objeto com as seleções dos usuários
        const selections = {};
        artistsRes.rows.forEach(row => {
            selections[row.artist_name] = {
                count: row.count,
                users: row.users || []
            };
        });

        res.render('index', { 
            user: req.user || null, 
            schedule, 
            selections 
        });
    } catch (err) {
        console.error(err);
        res.send('Erro ao recuperar artistas');
    }
});

// Página de Login
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Rota para processar o formulário de login com senha
app.post('/login', (req, res) => {
    const { password } = req.body;

    if (password === process.env.APP_PASSWORD) {
        // Senha correta, redireciona para a autenticação com Google
        res.redirect('/auth/google');
    } else {
        // Senha incorreta, re-renderiza a página de login com uma mensagem de erro
        res.render('login', { error: 'Senha incorreta. Tente novamente.' });
    }
});

// Rotas de Autenticação com Google
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // Sucesso na autenticação
        res.redirect('/');
    }
);

// Logout
app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Selecionar Artistas (via AJAX)
app.post('/select-artists', isAuthenticated, async (req, res) => {
    const selectedArtist = req.body.artists; // Recebendo apenas um artista por vez
    console.log(`Artista selecionado/deselecionado: ${selectedArtist}`);

    try {
        // Verificar se o artista já foi selecionado pelo usuário
        const resSelect = await pool.query('SELECT * FROM public.artist_selections WHERE user_id = $1 AND artist_name = $2', [req.user.id, selectedArtist]);

        if (resSelect.rows.length > 0) {
            // Artista já selecionado, remover seleção
            await pool.query('DELETE FROM public.artist_selections WHERE user_id = $1 AND artist_name = $2', [req.user.id, selectedArtist]);
            res.json({ success: true, message: 'Artista deselecionado.' });

            // Emitir evento de deseleção via Socket.io
            io.emit('artistDeselected', { 
                artist: selectedArtist, 
                user: { 
                    id: req.user.id, 
                    name: req.user.name, 
                    photo_url: req.user.photo_url 
                } 
            });
        } else {
            // Artista não selecionado, adicionar seleção
            await pool.query('INSERT INTO public.artist_selections (user_id, artist_name) VALUES ($1, $2)', [req.user.id, selectedArtist]);
            res.json({ success: true, message: 'Artista selecionado.' });

            // Emitir evento de seleção via Socket.io
            io.emit('artistSelected', { 
                artist: selectedArtist, 
                user: { 
                    id: req.user.id, 
                    name: req.user.name, 
                    photo_url: req.user.photo_url 
                } 
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao processar seleção.' });
    }
});

// Rota para obter usuários que selecionaram um artista
app.get('/artist-users', async (req, res) => {
    const artist = req.query.artist;
    if (!artist) {
        return res.status(400).json({ success: false, message: 'Artista não fornecido.' });
    }

    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.photo_url
            FROM public.artist_selections a
            JOIN public.users u ON a.user_id = u.id
            WHERE a.artist_name = $1
        `, [artist]);

        const users = result.rows.map(row => ({ id: row.id, name: row.name, photo_url: row.photo_url }));
        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao recuperar usuários.' });
    }
});

// Nova Rota para Obter Perfil do Usuário (Sem autenticação)
app.get('/user-profile/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        // Obter dados do usuário
        const userRes = await pool.query('SELECT name, photo_url FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
        }
        const user = userRes.rows[0];

        // Obter artistas selecionados pelo usuário
        const selectionsRes = await pool.query('SELECT artist_name FROM artist_selections WHERE user_id = $1', [userId]);
        const artistNames = selectionsRes.rows.map(row => row.artist_name);

        // Mapear cada artista para dia e palco
        const selectedArtists = {};
        Object.keys(schedule).forEach(day => {
            Object.keys(schedule[day]).forEach(stage => {
                schedule[day][stage].forEach(artistObj => {
                    const artist = Object.keys(artistObj)[0];
                    if (artistNames.includes(artist)) {
                        if (!selectedArtists[day]) {
                            selectedArtists[day] = {};
                        }
                        if (!selectedArtists[day][stage]) {
                            selectedArtists[day][stage] = [];
                        }
                        selectedArtists[day][stage].push(artist);
                    }
                });
            });
        });

        return res.json({
            success: true,
            user: {
                name: user.name,
                photo_url: user.photo_url
            },
            selectedArtists
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Erro ao recuperar o perfil do usuário.' });
    }
});

// Iniciando o Servidor com Socket.io
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});