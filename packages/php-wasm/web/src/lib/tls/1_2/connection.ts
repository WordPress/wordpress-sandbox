import { ServerNameExtension } from '../extensions/0_server_name';
import { CipherSuitesNames } from '../cipher-suites';
import { CipherSuites } from '../cipher-suites';
import { SupportedGroupsExtension } from '../extensions/10_supported_groups';
import { ECPointFormatsExtension } from '../extensions/11_ec_point_formats';
import { parseClientHelloExtensions } from '../extensions/parse-extensions';
import {
	ArrayBufferReader,
	as2Bytes,
	as3Bytes,
	as8Bytes,
	concatUint8Arrays,
} from '../utils';
import {
	HashAlgorithms,
	SignatureAlgorithms,
	SignatureAlgorithmsExtension,
} from '../extensions/13_signature_algorithms';
import { stringToArrayBuffer, tls12Prf } from '../prf';
import {
	SecurityParameters,
	ConnectionEnd,
	PRFAlgorithm,
	BulkCipherAlgorithm,
	CipherType,
	MACAlgorithm,
	CompressionMethod,
	SessionKeys,
	HandshakeType,
	ContentTypes,
	HandshakeMessage,
	ClientHello,
	ClientKeyExchange,
	Finished,
	ApplicationDataMessage,
	AlertMessage,
	ChangeCipherSpecMessage,
	TLSMessage,
	ContentType,
	TLSRecord,
	AlertLevelNames,
	AlertDescriptionNames,
	HandshakeMessageBody,
	HelloRequest,
	ECCurveTypes,
	ECNamedCurves,
} from './types';
import { logger } from '@php-wasm/logger';

class TLSConnectionClosed extends Error {}
const TLS_Version_1_2 = new Uint8Array([0x03, 0x03]);

/**
 * Implements TLS 1.2 server-side handshake.
 *
 * See https://datatracker.ietf.org/doc/html/rfc5246.
 */
export class TLS_1_2_Connection extends EventTarget {
	privateKey: CryptoKey;
	certificatesDER: Uint8Array[];
	receivedBuffer: Uint8Array = new Uint8Array();
	handshakeMessages: Uint8Array[] = [];
	private awaitingTLSRecords: Array<TLSRecord> = [];

	securityParameters: SecurityParameters = {
		entity: ConnectionEnd.Server,
		prf_algorithm: PRFAlgorithm.SHA256,
		bulk_cipher_algorithm: BulkCipherAlgorithm.AES,
		cipher_type: CipherType.Stream,
		enc_key_length: 16,
		block_length: 16,
		fixed_iv_length: 16,
		record_iv_length: 16,
		mac_algorithm: MACAlgorithm.HMACSHA256,
		mac_length: 32,
		mac_key_length: 32,
		compression_algorithm: CompressionMethod.Null,
		master_secret: new Uint8Array(48),
		client_random: new Uint8Array(32),
		server_random: crypto.getRandomValues(new Uint8Array(32)),
	};

	private clientPublicKey: CryptoKey | undefined;
	private ecdheKeyPair: CryptoKeyPair | undefined;
	private sessionKeys: SessionKeys | undefined;
	private closed = false;

	constructor(privateKey: CryptoKey, certificatesDER: Uint8Array[]) {
		super();
		this.privateKey = privateKey;
		this.certificatesDER = certificatesDER;
	}

	close() {
		this.closed = true;
	}

	receiveBytesFromClient(data: Uint8Array) {
		this.receivedBuffer = concatUint8Arrays([this.receivedBuffer, data]);
	}

	private sendBytesToClient(data: Uint8Array) {
		this.dispatchEvent(
			new CustomEvent('pass-tls-bytes-to-client', {
				detail: data,
			})
		);
	}

	/**
	 * TLS handshake as per RFC 5246.
	 *
	 * https://datatracker.ietf.org/doc/html/rfc5246#section-7.4
	 */
	async TLSHandshake(): Promise<void> {
		// Step 1: Receive ClientHello
		const clientHelloRecord = await this.readHandshakeMessage(
			HandshakeType.ClientHello
		);
		this.securityParameters.client_random = clientHelloRecord.body.random;
		if (!clientHelloRecord.body.cipher_suites.length) {
			throw new Error(
				'Client did not propose any supported cipher suites.'
			);
		}

		// Step 2: Choose hashing, encryption etc. and tell the
		//         client about our choices. Also share the certificate
		//         and the encryption keys.
		await this.writeTLSRecord(
			ContentTypes.Handshake,
			MessageEncoder.serverHello(
				clientHelloRecord.body,
				this.securityParameters.server_random,
				this.securityParameters.compression_algorithm
			)
		);

		await this.writeTLSRecord(
			ContentTypes.Handshake,
			MessageEncoder.certificate(this.certificatesDER)
		);

		this.ecdheKeyPair = await crypto.subtle.generateKey(
			{
				name: 'ECDH',
				namedCurve: 'P-256', // Use secp256r1 curve
			},
			true, // Extractable
			['deriveKey', 'deriveBits'] // Key usage
		);
		const serverKeyExchange = await MessageEncoder.ECDHEServerKeyExchange(
			this.securityParameters.client_random,
			this.securityParameters.server_random,
			this.ecdheKeyPair,
			this.privateKey
		);
		await this.writeTLSRecord(ContentTypes.Handshake, serverKeyExchange);
		await this.writeTLSRecord(
			ContentTypes.Handshake,
			MessageEncoder.serverHelloDone()
		);

		// Step 3: Receive the client's response, encryption keys, and
		//         decrypt the first encrypted message.
		const clientKeyExchangeRecord = await this.readHandshakeMessage(
			HandshakeType.ClientKeyExchange
		);
		this.clientPublicKey = await crypto.subtle.importKey(
			'raw',
			clientKeyExchangeRecord.body.exchange_keys,
			{ name: 'ECDH', namedCurve: 'P-256' },
			false,
			[]
		);

		await this.readNextMessage(ContentTypes.ChangeCipherSpec);

		this.sessionKeys = await this.deriveSessionKeys();

		await this.readHandshakeMessage(HandshakeType.Finished);
		// We're not actually verifying the hash provided by client
		// as we're not concerned with the client's identity.

		await this.writeTLSRecord(
			ContentTypes.ChangeCipherSpec,
			MessageEncoder.changeCipherSpec()
		);
		await this.writeTLSRecord(
			ContentTypes.Handshake,
			await MessageEncoder.createFinishedMessage(
				this.handshakeMessages,
				this.securityParameters.master_secret
			)
		);
	}

	startEmitingApplicationData() {
		this.pollForIncomingData();
	}

	private async pollForIncomingData() {
		try {
			while (true) {
				const appData = await this.readNextMessage(
					ContentTypes.ApplicationData
				);
				this.dispatchEvent(
					new CustomEvent('decrypted-bytes-from-client', {
						detail: appData.body,
					})
				);
			}
		} catch (e) {
			if (e instanceof TLSConnectionClosed) {
				// Connection closed, no more application data to emit.
				return;
			}
			throw e;
		}
	}

	private async readHandshakeMessage(
		messageType: HandshakeType.ClientHello
	): Promise<HandshakeMessage<ClientHello>>;
	private async readHandshakeMessage(
		messageType: HandshakeType.ClientKeyExchange
	): Promise<HandshakeMessage<ClientKeyExchange>>;
	private async readHandshakeMessage(
		messageType: HandshakeType.Finished
	): Promise<HandshakeMessage<Finished>>;
	private async readHandshakeMessage(
		messageType:
			| HandshakeType.ClientHello
			| HandshakeType.ClientKeyExchange
			| HandshakeType.Finished
	): Promise<HandshakeMessage<any>> {
		const message = await this.readNextMessage(ContentTypes.Handshake);
		if (message.msg_type !== messageType) {
			throw new Error(`Expected ${messageType} message`);
		}
		return message;
	}

	async readNextMessage(
		requestedType: (typeof ContentTypes)['Handshake']
	): Promise<HandshakeMessage<any>>;
	async readNextMessage(
		requestedType: (typeof ContentTypes)['ApplicationData']
	): Promise<ApplicationDataMessage>;
	async readNextMessage(
		requestedType: (typeof ContentTypes)['Alert']
	): Promise<AlertMessage>;
	async readNextMessage(
		requestedType: (typeof ContentTypes)['ChangeCipherSpec']
	): Promise<ChangeCipherSpecMessage>;
	async readNextMessage<Message extends TLSMessage>(
		requestedType: ContentType
	): Promise<Message> {
		const record = await this.readNextTLSRecord(requestedType);
		const message = (await this.parseTLSRecord(record)) as Message;
		if (message.type === ContentTypes.Handshake) {
			this.handshakeMessages.push(record.fragment);
		}
		logger.debug('message', message);
		return message;
	}

	private async readNextTLSRecord(
		requestedType: ContentType
	): Promise<TLSRecord> {
		while (true) {
			for (let i = 0; i < this.awaitingTLSRecords.length; i++) {
				const record = this.awaitingTLSRecords[i];
				if (record.type === ContentTypes.Alert) {
					throw new Error(
						`Alert message received: ${
							AlertLevelNames[record.fragment[0]]
						} ${AlertDescriptionNames[record.fragment[1]]}`
					);
				}
				if (record.type === requestedType) {
					this.awaitingTLSRecords.splice(i, 1);
					return record;
				}
			}

			// Read the TLS record header (5 bytes)
			const header = await this.readBytes(5);
			const length = (header[3] << 8) | header[4];
			const record = {
				type: header[0],
				version: {
					major: header[1],
					minor: header[2],
				},
				length,
				fragment: await this.readBytes(length),
			} as TLSRecord;

			const gotCompleteRecord = await this.processTLSRecord(record);
			if (!gotCompleteRecord) {
				continue;
			}
			this.awaitingTLSRecords.push(record);
		}
	}

	private async readBytes(length: number) {
		while (this.receivedBuffer.length < length) {
			// Patience is the key...
			await new Promise((resolve) => setTimeout(resolve, 100));
			if (this.closed) {
				throw new TLSConnectionClosed();
			}
		}
		const requestedBytes = this.receivedBuffer.slice(0, length);
		this.receivedBuffer = this.receivedBuffer.slice(length);
		return requestedBytes;
	}

	private async parseTLSRecord(record: TLSRecord): Promise<TLSMessage> {
		if (this.sessionKeys && record.type !== ContentTypes.ChangeCipherSpec) {
			record.fragment = await this.decryptData(
				record.type,
				record.fragment as Uint8Array
			);
		}
		switch (record.type) {
			case ContentTypes.Handshake: {
				return this.parseClientHandshakeMessage(record.fragment);
			}
			case ContentTypes.Alert: {
				return {
					type: record.type,
					level: AlertLevelNames[record.fragment[0]],
					description: AlertDescriptionNames[record.fragment[1]],
				};
			}
			case ContentTypes.ChangeCipherSpec: {
				return {
					type: record.type,
					body: {} as any,
				};
			}
			case ContentTypes.ApplicationData: {
				return {
					type: record.type,
					body: record.fragment,
				};
			}
			default:
				throw new Error(
					`Fatal: Unsupported TLS record type ${record.type}`
				);
		}
	}

	private receivedRecordSequenceNumber = 0;
	private sentRecordSequenceNumber = 0;
	private async decryptData(
		contentType: number,
		payload: Uint8Array
	): Promise<Uint8Array> {
		const iv = new Uint8Array([
			...this.sessionKeys!.clientIV,
			...payload.slice(0, 8),
		]);

		logger.debug('decrypting', payload);
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: iv,
				additionalData: new Uint8Array([
					// Sequence number
					...as8Bytes(this.receivedRecordSequenceNumber),
					// Content type
					contentType,
					// Protocol version
					0x03,
					0x03,
					// Length without IV and tag
					...as2Bytes(payload.length - 8 - 16),
				]),
				tagLength: 128,
			},
			this.sessionKeys!.clientWriteKey,
			payload.slice(8)
		);
		++this.receivedRecordSequenceNumber;

		return new Uint8Array(decrypted);
	}

	private async encryptData(
		contentType: number,
		payload: Uint8Array
	): Promise<Uint8Array> {
		// Generate a unique explicit IV (8 bytes)
		const explicitIV = crypto.getRandomValues(new Uint8Array(8));
		const iv = new Uint8Array([
			...this.sessionKeys!.serverIV,
			...explicitIV,
		]);

		const additionalData = new Uint8Array([
			// Sequence number
			...as8Bytes(this.sentRecordSequenceNumber),
			// Content type
			contentType,
			// Protocol version
			0x03,
			0x03,
			// Payload length
			...as2Bytes(payload.length),
		]);
		const ciphertextWithTag = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv,
				additionalData,
				tagLength: 128,
			},
			this.sessionKeys!.serverWriteKey,
			payload
		);
		++this.sentRecordSequenceNumber;

		const encrypted = concatUint8Arrays([
			explicitIV,
			new Uint8Array(ciphertextWithTag),
		]);

		return encrypted;
	}

	bufferedRecords: Partial<Record<ContentType, Uint8Array>> = {};
	private async processTLSRecord(record: TLSRecord): Promise<boolean> {
		switch (record.type) {
			case ContentTypes.Handshake: {
				const message = concatUint8Arrays([
					this.bufferedRecords[record.type] || new Uint8Array(),
					record.fragment,
				]);
				this.bufferedRecords[record.type] = message;
				// We don't have the message header yet, let's wait for more data.
				if (message.length < 4) {
					return false;
				}
				const length = (message[1] << 8) | message[2];
				if (message.length < 3 + length) {
					return false;
				}
				return true;
			}
			case ContentTypes.Alert: {
				const message = concatUint8Arrays([
					this.bufferedRecords[record.type] || new Uint8Array(),
					record.fragment,
				]);
				if (message.length < 2) {
					return false;
				}
				return true;
			}
			case ContentTypes.ChangeCipherSpec: {
				return true;
			}
			case ContentTypes.ApplicationData: {
				return true;
			}
			default:
				throw new Error(`Unsupported record type ${record.type}`);
		}
	}

	private parseClientHandshakeMessage<T extends HandshakeMessageBody>(
		message: Uint8Array
	): HandshakeMessage<T> {
		const msg_type = message[0];
		const length = (message[1] << 16) | (message[2] << 8) | message[3];
		const bodyBytes = message.slice(4);
		const reader = new ArrayBufferReader(bodyBytes.buffer);
		let body: HandshakeMessageBody | undefined = undefined;
		switch (msg_type) {
			case HandshakeType.HelloRequest:
				body = {} as HelloRequest;
				break;
			/*
				Offset  Size    Field
				(bytes) (bytes)
				+------+------+---------------------------+
				| 0000 |  1   | Handshake Type (1 = ClientHello)
				+------+------+---------------------------+
				| 0001 |  3   | Length of ClientHello
				+------+------+---------------------------+
				| 0004 |  2   | Protocol Version
				+------+------+---------------------------+
				| 0006 |  32  | Client Random
				|      |      | (4 bytes timestamp +
				|      |      |  28 bytes random)
				+------+------+---------------------------+
				| 0038 |  1   | Session ID Length
				+------+------+---------------------------+
				| 0039 |  0+  | Session ID (variable)
				|      |      | (0-32 bytes)
				+------+------+---------------------------+
				| 003A*|  2   | Cipher Suites Length
				+------+------+---------------------------+
				| 003C*|  2+  | Cipher Suites
				|      |      | (2 bytes each)
				+------+------+---------------------------+
				| xxxx |  1   | Compression Methods Length
				+------+------+---------------------------+
				| xxxx |  1+  | Compression Methods
				|      |      | (1 byte each)
				+------+------+---------------------------+
				| xxxx |  2   | Extensions Length
				+------+------+---------------------------+
				| xxxx |  2   | Extension Type
				+------+------+---------------------------+
				| xxxx |  2   | Extension Length
				+------+------+---------------------------+
				| xxxx |  v   | Extension Data
				+------+------+---------------------------+
				|      |      | (Additional extensions...)
				+------+------+---------------------------+
				*/
			case HandshakeType.ClientHello: {
				const buff: Partial<ClientHello> = {
					client_version: reader.readUint8Array(2),
					/**
					 * Technically this consists of a GMT timestamp
					 * and 28 random bytes, but we don't need to
					 * parse this further.
					 */
					random: reader.readUint8Array(32),
				};
				const sessionIdLength = reader.readUint8();
				buff.session_id = reader.readUint8Array(sessionIdLength);

				const cipherSuitesLength = reader.readUint16();
				buff.cipher_suites = parseCipherSuites(
					reader.readUint8Array(cipherSuitesLength).buffer
				);

				const compressionMethodsLength = reader.readUint8();
				buff.compression_methods = reader.readUint8Array(
					compressionMethodsLength
				);

				const extensionsLength = reader.readUint16();
				buff.extensions = parseClientHelloExtensions(
					reader.readUint8Array(extensionsLength)
				);
				return {
					type: ContentTypes.Handshake,
					msg_type,
					length,
					body: buff as T,
				} as HandshakeMessage<T>;
			}
			/**
			 * Binary layout:
			 *
				+------------------------------------+
				| ECDH Client Public Key Length [1B] |
				+------------------------------------+
				| ECDH Client Public Key   [variable]|
				+------------------------------------+
			 */
			case HandshakeType.ClientKeyExchange:
				body = {
					// Skip the first byte, which is the length of the public key
					exchange_keys: bodyBytes.slice(1, bodyBytes.length),
				} as ClientKeyExchange;
				break;
			case HandshakeType.Finished:
				body = {
					verify_data: bodyBytes,
				} as Finished;
				break;
			default:
				throw new Error(`Invalid handshake type ${msg_type}`);
		}
		return {
			type: ContentTypes.Handshake,
			msg_type,
			length,
			body: body as T,
		};
	}

	// Function to write a TLS record
	private async writeTLSRecord(
		contentType: number,
		payload: Uint8Array
	): Promise<void> {
		if (contentType === ContentTypes.Handshake) {
			this.handshakeMessages.push(payload);
		}
		if (this.sessionKeys && contentType !== ContentTypes.ChangeCipherSpec) {
			payload = await this.encryptData(contentType, payload);
		}

		const version = [0x03, 0x03]; // TLS 1.2
		const length = payload.length;
		const header = new Uint8Array(5);
		header[0] = contentType;
		header[1] = version[0];
		header[2] = version[1];
		header[3] = (length >> 8) & 0xff;
		header[4] = length & 0xff;

		const record = concatUint8Arrays([header, payload]);
		this.sendBytesToClient(record);
	}

	// Full key derivation function
	private async deriveSessionKeys(): Promise<SessionKeys> {
		const preMasterSecret = await crypto.subtle.deriveBits(
			{
				name: 'ECDH',
				public: this.clientPublicKey!, // Client's ECDHE public key
			},
			this.ecdheKeyPair!.privateKey, // Server's ECDHE private key
			256 // Length of the derived secret (256 bits for P-256)
		);
		this.securityParameters.master_secret = new Uint8Array(
			await tls12Prf(
				preMasterSecret,
				stringToArrayBuffer('master secret'),
				concatUint8Arrays([
					this.securityParameters.client_random,
					this.securityParameters.server_random,
				]),
				48
			)
		);

		const keyBlock = await tls12Prf(
			this.securityParameters.master_secret,
			stringToArrayBuffer('key expansion'),
			concatUint8Arrays([
				this.securityParameters.server_random,
				this.securityParameters.client_random,
			]),
			// Client key, server key, client IV, server IV
			16 + 16 + 4 + 4
		);

		const reader = new ArrayBufferReader(keyBlock);
		const clientWriteKey = reader.readUint8Array(16);
		const serverWriteKey = reader.readUint8Array(16);
		const clientIV = reader.readUint8Array(4);
		const serverIV = reader.readUint8Array(4);

		return {
			clientWriteKey: await crypto.subtle.importKey(
				'raw',
				clientWriteKey,
				{ name: 'AES-GCM' },
				false,
				['encrypt', 'decrypt']
			),
			serverWriteKey: await crypto.subtle.importKey(
				'raw',
				serverWriteKey,
				{ name: 'AES-GCM' },
				false,
				['encrypt', 'decrypt']
			),
			clientIV,
			serverIV,
		};
	}
}

/**
 * Parses the cipher suites from the server hello message.
 *
 * The cipher suites are encoded as a list of 2-byte values.
 *
 * Binary layout:
 *
 * +----------------------------+
 * | Cipher Suites Length       |  2 bytes
 * +----------------------------+
 * | Cipher Suite 1             |  2 bytes
 * +----------------------------+
 * | Cipher Suite 2             |  2 bytes
 * +----------------------------+
 * | ...                        |
 * +----------------------------+
 * | Cipher Suite n             |  2 bytes
 * +----------------------------+
 *
 *
 * The full list of supported cipher suites values is available at:
 *
 * https://www.iana.org/assignments/tls-parameters/tls-parameters.xhtml#tls-parameters-4
 */
function parseCipherSuites(buffer: ArrayBuffer): string[] {
	const reader = new ArrayBufferReader(buffer);
	// Skip the length of the cipher suites
	reader.readUint16();

	const cipherSuites = [];
	while (!reader.isFinished()) {
		const suite = reader.readUint16();
		if (!(suite in CipherSuitesNames)) {
			logger.warn(`Unsupported cipher suite: ${suite}`);
			continue;
		}
		cipherSuites.push(CipherSuitesNames[suite]);
	}
	return cipherSuites;
}

class MessageEncoder {
	static certificate(certificatesDER: ArrayBuffer[]): Uint8Array {
		const certsBodies: Uint8Array[] = [];
		for (const cert of certificatesDER) {
			certsBodies.push(as3Bytes(cert.byteLength));
			certsBodies.push(new Uint8Array(cert));
		}
		const certsBody = concatUint8Arrays(certsBodies);
		const body = new Uint8Array([
			...as3Bytes(certsBody.byteLength),
			...certsBody,
		]);
		return new Uint8Array([
			HandshakeType.Certificate,
			...as3Bytes(body.length),
			...body,
		]);
	}

	/*
	 * Byte layout of the ServerKeyExchange message:
	 *
	 * +-----------------------------------+
	 * |    ServerKeyExchange Message      |
	 * +-----------------------------------+
	 * | Handshake type (1 byte)           |
	 * +-----------------------------------+
	 * | Length (3 bytes)                  |
	 * +-----------------------------------+
	 * | Curve Type (1 byte)               |
	 * +-----------------------------------+
	 * | Named Curve (2 bytes)             |
	 * +-----------------------------------+
	 * | EC Point Format (1 byte)          |
	 * +-----------------------------------+
	 * | Public Key Length (1 byte)        |
	 * +-----------------------------------+
	 * | Public Key (variable)             |
	 * +-----------------------------------+
	 * | Signature Algorithm (2 bytes)     |
	 * +-----------------------------------+
	 * | Signature Length (2 bytes)        |
	 * +-----------------------------------+
	 * | Signature (variable)              |
	 * +-----------------------------------+
	 *
	 * @param clientRandom - 32 bytes from ClientHello
	 * @param serverRandom - 32 bytes from ServerHello
	 * @param ecdheKeyPair - ECDHE key pair
	 * @param rsaPrivateKey - RSA private key for signing
	 * @returns
	 */
	static async ECDHEServerKeyExchange(
		clientRandom: Uint8Array,
		serverRandom: Uint8Array,
		ecdheKeyPair: CryptoKeyPair,
		rsaPrivateKey: CryptoKey
	): Promise<Uint8Array> {
		// 65 bytes (04 followed by x and y coordinates)
		const publicKey = new Uint8Array(
			await crypto.subtle.exportKey('raw', ecdheKeyPair.publicKey)
		);

		/*
		 * The ServerKeyExchange message is extended as follows.
		 *
		 * select (KeyExchangeAlgorithm) {
		 *     case ec_diffie_hellman:
		 *         ServerECDHParams    params;
		 *         Signature           signed_params;
		 * } ServerKeyExchange;
		 *
		 * struct {
		 *   ECCurveType     curve_type;
		 *   NamedCurve      namedcurve;
		 *   ECPoint         public;
		 * } ServerECDHParams;
		 */
		const params = new Uint8Array([
			// Curve type (1 byte)
			ECCurveTypes.NamedCurve,
			// Curve name (2 bytes)
			...as2Bytes(ECNamedCurves.secp256r1),

			// Public key length (1 byte)
			publicKey.byteLength,

			// Public key (65 bytes, uncompressed format)
			...publicKey,
		]);

		/**
		 * signed_params:
		 *    A hash of the params, with the signature appropriate to that hash
		 *    applied.  The private key corresponding to the certified public key
		 *    in the server's Certificate message is used for signing.
		 *
		 *    Signature = encrypt(SHA(
		 *       ClientHello.random + ServerHello.random + ServerECDHParams
		 *    ));
		 */
		const signedParams = await crypto.subtle.sign(
			{
				name: 'RSASSA-PKCS1-v1_5',
				hash: 'SHA-256',
			},
			rsaPrivateKey,
			new Uint8Array([...clientRandom, ...serverRandom, ...params])
		);
		const signatureBytes = new Uint8Array(signedParams);

		/**
		 * SignatureAlgorithm is "rsa" for the ECDHE_RSA key exchange
		 * These cases are defined in TLS [RFC2246].
		 */
		const signatureAlgorithm = new Uint8Array([
			HashAlgorithms.sha256,
			SignatureAlgorithms.rsa,
		]);

		// Step 6: Construct the complete Server Key Exchange message
		const body = new Uint8Array([
			...params,
			...signatureAlgorithm,
			...as2Bytes(signatureBytes.length),
			...signatureBytes,
		]);

		return new Uint8Array([
			HandshakeType.ServerKeyExchange,
			...as3Bytes(body.length),
			...body,
		]);
	}

	/**
	 * +------------------------------------+
	 * | Content Type (Handshake)     [1B]  |
	 * | 0x16                               |
	 * +------------------------------------+
	 * | Version (TLS 1.2)            [2B]  |
	 * | 0x03 0x03                          |
	 * +------------------------------------+
	 * | Length                       [2B]  |
	 * +------------------------------------+
	 * | Handshake Type (ServerHello) [1B]  |
	 * | 0x02                               |
	 * +------------------------------------+
	 * | Handshake Length             [3B]  |
	 * +------------------------------------+
	 * | Server Version               [2B]  |
	 * +------------------------------------+
	 * | Server Random               [32B]  |
	 * +------------------------------------+
	 * | Session ID Length            [1B]  |
	 * +------------------------------------+
	 * | Session ID             [0-32B]     |
	 * +------------------------------------+
	 * | Cipher Suite                 [2B]  |
	 * +------------------------------------+
	 * | Compression Method           [1B]  |
	 * +------------------------------------+
	 * | Extensions Length            [2B]  |
	 * +------------------------------------+
	 * | Extension: ec_point_formats        |
	 * |   Type (0x00 0x0B)           [2B]  |
	 * |   Length                     [2B]  |
	 * |   EC Point Formats Length    [1B]  |
	 * |   EC Point Format            [1B]  |
	 * +------------------------------------+
	 * | Other Extensions...                |
	 * +------------------------------------+
	 */
	static serverHello(
		clientHello: ClientHello,
		serverRandom: Uint8Array,
		compressionAlgorithm: number
	): Uint8Array {
		const extensionsParts: Uint8Array[] = clientHello.extensions
			.map((extension) => {
				switch (extension['type']) {
					case 'server_name':
						/**
						 * The server SHALL include an extension of type "server_name" in the
						 * (extended) server hello.  The "extension_data" field of this extension
						 * SHALL be empty.
						 *
						 * Source: dfile:///Users/cloudnik/Library/Application%20Support/Dash/User%20Contributed/RFCs/RFCs.docset/Contents/Resources/Documents/rfc6066.html#section-3
						 */
						return ServerNameExtension.encodeFromClient();
					case 'supported_groups':
						return SupportedGroupsExtension.encodeForClient(
							'secp256r1'
						);
					case 'ec_point_formats':
						return ECPointFormatsExtension.encodeForClient(
							'uncompressed'
						);
					case 'signature_algorithms':
						return SignatureAlgorithmsExtension.encodeforClient(
							'sha256',
							'rsa'
						);
				}
				return undefined;
			})
			.filter((x): x is Uint8Array => x !== undefined);
		const extensions = concatUint8Arrays(extensionsParts);

		const body = new Uint8Array([
			// Version field – 0x03, 0x03 means TLS 1.2
			...TLS_Version_1_2,

			...serverRandom,

			clientHello.session_id.length,
			...clientHello.session_id,

			...as2Bytes(CipherSuites.TLS1_CK_ECDHE_RSA_WITH_AES_128_GCM_SHA256),

			compressionAlgorithm,

			// Extensions length (2 bytes)
			...as2Bytes(extensions.length),

			...extensions,
		]);

		return new Uint8Array([
			HandshakeType.ServerHello,
			...as3Bytes(body.length),
			...body,
		]);
	}

	static serverHelloDone(): Uint8Array {
		return new Uint8Array([HandshakeType.ServerHelloDone, ...as3Bytes(0)]);
	}

	/**
	 * Server finished message.
	 * The structure is defined in:
	 * https://datatracker.ietf.org/doc/html/rfc5246#section-7.4.9
	 *
	 * struct {
	 *     opaque verify_data[verify_data_length];
	 * } Finished;
	 *
	 * verify_data
	 *    PRF(master_secret, finished_label, Hash(handshake_messages))
	 *       [0..verify_data_length-1];
	 *
	 * finished_label
	 *    For Finished messages sent by the client, the string
	 *    "client finished".  For Finished messages sent by the server,
	 *    the string "server finished".
	 */
	static async createFinishedMessage(
		handshakeMessages: Uint8Array[],
		masterSecret: ArrayBuffer
	): Promise<Uint8Array> {
		// Step 1: Compute the hash of the handshake messages
		const handshakeHash = await crypto.subtle.digest(
			'SHA-256',
			concatUint8Arrays(handshakeMessages)
		);

		// Step 2: Compute the verify_data using the PRF
		const verifyData = new Uint8Array(
			await tls12Prf(
				masterSecret,
				stringToArrayBuffer('server finished'),
				handshakeHash,
				// verify_data length. TLS 1.2 specifies 12 bytes for verify_data
				12
			)
		);

		// Step 3: Construct the Finished message
		return new Uint8Array([
			HandshakeType.Finished,
			...as3Bytes(verifyData.length),
			...verifyData,
		]);
	}

	static changeCipherSpec(): Uint8Array {
		return new Uint8Array([0x01]);
	}
}
