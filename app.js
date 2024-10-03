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
                // Inserir novo usuário
                const insertRes = await pool.query(
                    'INSERT INTO public.users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *',
                    [profile.id, profile.emails[0].value, profile.displayName]
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

// Rotas

// Página Inicial com Programação e Interações Condicionais
app.get('/', async (req, res) => {
    try {
        // Obter artistas e contagem de seleções e usuários que selecionaram
        const artistsRes = await pool.query(`
            SELECT a.artist_name, COUNT(a.user_id) as count,
                   STRING_AGG(u.name, ', ') AS users
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
                users: row.users ? row.users.split(', ') : []
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
        } else {
            // Artista não selecionado, adicionar seleção
            await pool.query('INSERT INTO public.artist_selections (user_id, artist_name) VALUES ($1, $2)', [req.user.id, selectedArtist]);
            res.json({ success: true, message: 'Artista selecionado.' });
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
            SELECT u.name 
            FROM public.artist_selections a
            JOIN public.users u ON a.user_id = u.id
            WHERE a.artist_name = $1
        `, [artist]);

        const users = result.rows.map(row => row.name);
        res.json({ success: true, users });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erro ao recuperar usuários.' });
    }
});

// Iniciando o Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});