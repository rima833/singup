import { auth, storage, db } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  signOut,
  updateProfile,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

function switchView(viewId) {
  document.querySelectorAll('.auth-view').forEach(view => view.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

// Toast + Field Highlight
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show';
  setTimeout(() => {
    toast.className = toast.className.replace('show', '');
  }, 3000);
}

function highlightField(fieldId) {
  const field = document.getElementById(fieldId);
  field.classList.add('field-error');
  field.focus();
  setTimeout(() => field.classList.remove('field-error'), 3000);
}

// Navigation
document.getElementById('go-to-signup').addEventListener('click', e => {
  e.preventDefault();
  switchView('signup-view');
});
document.getElementById('go-to-reset').addEventListener('click', e => {
  e.preventDefault();
  switchView('reset-view');
});
document.getElementById('go-to-login-from-signup').addEventListener('click', e => {
  e.preventDefault();
  switchView('login-view');
});
document.getElementById('go-to-login-from-reset').addEventListener('click', e => {
  e.preventDefault();
  switchView('login-view');
});

let savedEmail = '';
let savedPhone = '';
let confirmationResultGlobal = null;

// Signup
document.getElementById('signup-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('phone-number').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  const termsChecked = document.getElementById('terms').checked;
  const errorElem = document.getElementById('signup-error');
  errorElem.textContent = '';

  if (!/^\d{10}$/.test(phone)) {
    showToast("Enter a valid 10-digit phone number.");
    highlightField("phone-number");
    return;
  }

  if (password !== confirmPassword) {
    showToast("Passwords do not match.");
    highlightField("confirm-password");
    return;
  }

  if (!termsChecked) {
    showToast("You must agree to the Terms and Conditions.");
    highlightField("terms");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    savedEmail = email;
    savedPhone = phone;

    await setDoc(doc(db, "users", cred.user.uid), {
      email: cred.user.email,
      phone: savedPhone,
      isVerified: false,
      createdAt: new Date()
    });

    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('verification-method-section').style.display = 'block';
    showToast("Account created. Choose how to verify.");
    switchView('verification-method-view'); // Ensure the verification method view is shown
  } catch (err) {
    errorElem.textContent = err.message;
  }
});


// Verification method
document.getElementById('start-verification').addEventListener('click', async () => {
  const method = document.querySelector('input[name="verification-method"]:checked');
  const msg = document.getElementById('verification-message');

  if (!method) {
    showToast("Please select a verification method.");
    return;
  }

  if (method.value === 'email') {
    try {
      await sendEmailVerification(auth.currentUser);
      await setDoc(doc(db, "users", auth.currentUser.uid), { isVerified: false }, { merge: true });
      showToast("Verification email sent.");
      msg.textContent = `A verification email has been sent to ${savedEmail}`;
      msg.style.display = "block";
      switchView('login-view');
    } catch (error) {
      showToast("Email verification failed.");
    }
  } else if (method.value === 'phone') {
    try {
      window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
        size: 'invisible'
      }, auth);

      const fullPhone = '+234' + savedPhone;
      confirmationResultGlobal = await signInWithPhoneNumber(auth, fullPhone, window.recaptchaVerifier);
      document.getElementById('otp-section').style.display = 'block';
      switchView('otp-view'); // Ensure the OTP view is shown
    } catch (error) {
      showToast("Phone verification failed.");
    }
  }
});

document.getElementById('verify-sms-code').addEventListener('click', async () => {
  const code = document.getElementById('sms-code').value;
  try {
    await confirmationResultGlobal.confirm(code);
    await setDoc(doc(db, "users", auth.currentUser.uid), { isVerified: true }, { merge: true });
    showToast("Phone number verified.");
    document.getElementById('verification-message').textContent = `Phone verified: ${savedPhone}`;
    document.getElementById('verification-message').style.display = "block";
    switchView('dashboard-view');
    setupSettingsToggle(); // ✅ Show settings
  } catch (error) {
    showToast("Invalid code.");
  }
});

// Login
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const user = cred.user;
    const isEmailVerified = user.emailVerified;
    const isPhoneUser = user.providerData.some(p => p.providerId === 'phone');

    if (isEmailVerified || isPhoneUser) {
      await setDoc(doc(db, "users", user.uid), { isVerified: true }, { merge: true });
      document.getElementById('user-info').textContent = `Welcome, ${user.email}`;
      switchView('dashboard-view');
      setupSettingsToggle(); // ✅
    } else {
      showToast("You must verify your email or phone number before logging in.");
      await signOut(auth);
    }
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
      document.getElementById('login-error').textContent = "Incorrect email or password. Please try again.";
    } else {
      document.getElementById('login-error').textContent = err.message;
    }
  }
});

// Reset
document.getElementById('reset-form').addEventListener('submit', e => {
  e.preventDefault();
  const email = document.getElementById('reset-email').value;
  sendPasswordResetEmail(auth, email)
    .then(() => document.getElementById('reset-message').textContent = 'Check your inbox for a reset link.')
    .catch(err => document.getElementById('reset-message').textContent = err.message);
});

// Google login
document.getElementById('google-login').addEventListener('click', () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then(async (result) => {
      const user = result.user;
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        provider: "google",
        isVerified: true,
        createdAt: new Date()
      });
      document.getElementById('user-info').textContent = `Welcome, ${user.email}`;
      switchView('dashboard-view');
      setupSettingsToggle(); // ✅
    })
    .catch(err => {
      document.getElementById('login-error').textContent = err.message;
    });
});

// Auth state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const isEmailVerified = user.emailVerified;
    const isPhoneUser = user.providerData.some(p => p.providerId === 'phone');
    if (isEmailVerified || isPhoneUser) {
      document.getElementById('user-info').textContent = `Welcome, ${user.email}`;
      switchView('dashboard-view');
      setupSettingsToggle(); // ✅
    } else {
      await signOut(auth);
    }
  }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// Update name
document.getElementById('update-profile-btn').addEventListener('click', () => {
  const newName = document.getElementById('display-name-input').value;
  const user = auth.currentUser;
  if (user && newName.trim()) {
    updateProfile(user, { displayName: newName })
      .then(() => {
        document.getElementById('user-info').textContent = `Welcome, ${newName}`;
        document.getElementById('update-success').textContent = "Name updated.";
      })
      .catch(err => document.getElementById('update-success').textContent = err.message);
  }
});

const fileInput = document.getElementById('upload-photo');
  const profileLabel = document.getElementById('profile-photo-label');

  fileInput.addEventListener('change', function () {
    const file = this.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();

      reader.onload = function (e) {
        profileLabel.innerHTML = `<img src="${e.target.result}" alt="Profile Picture" style="width: 80px; height: 80px; border-radius: 50%;">`;
      };

      reader.readAsDataURL(file);
    }
  });

// Add your JavaScript code here

// Handle profile photo upload
document.getElementById('upload-photo-btn').addEventListener('click', () => {
  const fileInput = document.getElementById('photo-upload');
  const file = fileInput.files[0];

  if (!file) {
    alert('Please select a file to upload.');
    return;
  }

  // Simulate file upload process
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('profile-photo').src = reader.result;
    document.getElementById('update-success').textContent = 'Profile photo updated successfully!';
  };
  reader.readAsDataURL(file);
});

// State & LGAs
const stateToLocalGovernments = {
  abia: ["Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano", "Isiala Ngwa North", "Isiala Ngwa South", "Isuikwuato", "Obi Ngwa", "Ohafia", "Osisioma", "Ugwunagbo", "Ukwa East", "Ukwa West", "Umuahia North", "Umuahia South", "Umu Nneochi"],
  adamawa: ["Demsa", "Fufore", "Ganye", "Girei", "Gombi", "Guyuk", "Hong", "Jada", "Lamurde", "Madagali", "Maiha", "Mayo-Belwa", "Michika", "Mubi North", "Mubi South", "Numan", "Shelleng", "Song", "Toungo", "Yola North", "Yola South"],
  akwaIbom: ["Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obot Akara", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko", "Uyo"],
  anambra: ["Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North", "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North", "Onitsha South", "Orumba North", "Orumba South", "Oyi"],
  bauchi: ["Alkaleri", "Bauchi", "Bogoro", "Damban", "Darazo", "Dass", "Gamawa", "Ganjuwa", "Giade", "Itas/Gadau", "Jama'are", "Katagum", "Kirfi", "Misau", "Ningi", "Shira", "Tafawa Balewa", "Toro", "Warji", "Zaki"],
  bayelsa: ["Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama", "Southern Ijaw", "Yenagoa"],
  benue: ["Ado", "Agatu", "Apa", "Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Katsina-Ala", "Konshisha", "Kwande", "Logo", "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu", "Otukpo", "Tarka", "Ukum", "Ushongo", "Vandeikya"],
  borno: ["Abadam", "Askira/Uba", "Bama", "Bayo", "Biu", "Chibok", "Damboa", "Dikwa", "Gubio", "Guzamala", "Gwoza", "Hawul", "Jere", "Kaga", "Kala/Balge", "Konduga", "Kukawa", "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri", "Marte", "Mobbar", "Monguno", "Ngala", "Nganzai", "Shani"],
  crossRiver: ["Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki", "Calabar Municipal", "Calabar South", "Etung", "Ikom", "Obanliku", "Obubra", "Obudu", "Odukpani", "Ogoja", "Yakuur", "Yala"],
  delta: ["Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East", "Ethiope West", "Ika North East", "Ika South", "Isoko North", "Isoko South", "Ndokwa East", "Ndokwa West", "Okpe", "Oshimili North", "Oshimili South", "Patani", "Sapele", "Udu", "Ughelli North", "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South", "Warri South West"],
  ebonyi: ["Abakaliki", "Afikpo North", "Afikpo South", "Ebonyi", "Ezza North", "Ezza South", "Ikwo", "Ishielu", "Ivo", "Izzi", "Ohaozara", "Ohaukwu", "Onicha"],
  edo: ["Akoko-Edo", "Egor", "Esan Central", "Esan North-East", "Esan South-East", "Esan West", "Etsako Central", "Etsako East", "Etsako West", "Igueben", "Ikpoba-Okha", "Oredo", "Orhionmwon", "Ovia North-East", "Ovia South-West", "Owan East", "Owan West", "Uhunmwonde"],
  ekiti: ["Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West", "Ekiti West", "Emure", "Gbonyin", "Ido Osi", "Ijero", "Ikere", "Ikole", "Ilejemeje", "Irepodun/Ifelodun", "Ise/Orun", "Moba", "Oye"],
  enugu: ["Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu", "Igbo Etiti", "Igbo Eze North", "Igbo Eze South", "Isi Uzo", "Nkanu East", "Nkanu West", "Nsukka", "Oji River", "Udenu", "Udi", "Uzo Uwani"],
  gombe: ["Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo", "Kwami", "Nafada", "Shongom", "Yamaltu/Deba"],
  imo: ["Aboh Mbaise", "Ahiazu Mbaise", "Ehime Mbano", "Ezinihitte", "Ideato North", "Ideato South", "Ihitte/Uboma", "Ikeduru", "Isiala Mbano", "Isu", "Mbaitoli", "Ngor Okpala", "Njaba", "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema", "Okigwe", "Onuimo", "Orlu", "Orsu", "Oru East", "Oru West", "Owerri Municipal", "Owerri North", "Owerri West"],
  jigawa: ["Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa", "Garki", "Gumel", "Guri", "Gwaram", "Gwiwa", "Hadejia", "Jahun", "Kafin Hausa", "Kaugama", "Kazaure", "Kiri Kasama", "Kiyawa", "Maigatari", "Malam Madori", "Miga", "Ringim", "Roni", "Sule Tankarkar", "Taura", "Yankwashi"],
  kaduna: ["Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia", "Kaduna North", "Kaduna South", "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria"],
  kano: ["Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala", "Dambatta", "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam", "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya", "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir", "Nasarawa", "Rano", "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa", "Wudil"],
  katsina: ["Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi", "Dandume", "Danja", "Dan Musa", "Daura", "Dutsi", "Dutsin Ma", "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur", "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada", "Mai'Adua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi", "Sabuwa", "Safana", "Sandamu", "Zango"],
  kebbi: ["Aleiro", "Arewa Dandi", "Argungu", "Augie", "Bagudo", "Birnin Kebbi", "Bunza", "Dandi", "Fakai", "Gwandu", "Jega", "Kalgo", "Koko/Besse", "Maiyama", "Ngaski", "Sakaba", "Shanga", "Suru", "Wasagu/Danko", "Yauri", "Zuru"],
  kogi: ["Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela-Odolu", "Ijumu", "Kabba/Bunu", "Kogi", "Lokoja", "Mopa-Muro", "Ofu", "Ogori/Magongo", "Okehi", "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West"],
  kwara: ["Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East", "Ilorin South", "Ilorin West", "Irepodun", "Isin", "Kaiama", "Moro", "Offa", "Oke Ero", "Oyun", "Pategi"],
  lagos: ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere"],
  nasarawa: ["Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia", "Nasarawa", "Nasarawa Egon", "Obi", "Toto", "Wamba"],
  niger: ["Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai", "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa", "Muya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa", "Wushishi"],
  ogun: ["Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Egbado North", "Egbado South", "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East", "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu", "Ogun Waterside", "Remo North", "Shagamu"],
  ondo: ["Akoko North-East", "Akoko North-West", "Akoko South-East", "Akoko South-West", "Akure North", "Akure South", "Ese Odo", "Idanre", "Ifedore", "Ilaje", "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa", "Ondo East", "Ondo West", "Ose", "Owo"],
  osun: ["Atakunmosa East", "Atakunmosa West", "Aiyedaade", "Aiyedire", "Boluwaduro", "Boripe", "Ede North", "Ede South", "Egbedore", "Ejigbo", "Ife Central", "Ife East", "Ife North", "Ife South", "Ifedayo", "Ifelodun", "Ila", "Ilesa East", "Ilesa West", "Irepodun", "Irewole", "Isokan", "Iwo", "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade", "Orolu", "Osogbo"],
  oyo: ["Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North", "Ibadan North-East", "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido", "Irepo", "Iseyin", "Itesiwaju", "Iwajowa", "Kajola", "Lagelu", "Ogbomosho North", "Ogbomosho South", "Ogo Oluwa", "Olorunsogo", "Oluyole", "Ona Ara", "Orelope", "Ori Ire", "Oyo East", "Oyo West", "Saki East", "Saki West", "Surulere"],
  plateau: ["Barkin Ladi", "Bassa", "Bokkos", "Jos East", "Jos North", "Jos South", "Kanam", "Kanke", "Langtang North", "Langtang South", "Mangu", "Mikang", "Pankshin", "Qua'an Pan", "Riyom", "Shendam", "Wase"],
  rivers: ["Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo", "Port Harcourt", "Tai"],
  sokoto: ["Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa", "Illela", "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni", "Shagari", "Silame", "Sokoto North", "Sokoto South", "Tambuwal", "Tangaza", "Tureta", "Wamako", "Wurno", "Yabo"],
  taraba: ["Ardo Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi", "Jalingo", "Karim Lamido", "Kurmi", "Lau", "Sardauna", "Takum", "Ussa", "Wukari", "Yorro", "Zing"],
  yobe: ["Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Gulani", "Jakusko", "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari"],
  zamfara: ["Anka", "Bakura", "Birnin Magaji/Kiyaw", "Bukkuyum", "Bungudu", "Gummi", "Gusau", "Kaura Namoda", "Maradun", "Maru", "Shinkafi", "Talata Mafara", "Tsafe", "Zurmi"],
  fct: ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"]
  // Add other states and their LGAs here
};

const stateSelect = document.getElementById("state");
const localGovernmentSelect = document.getElementById("local-government");

stateSelect.addEventListener("change", () => {
  const selectedState = stateSelect.value;
  const localGovernments = stateToLocalGovernments[selectedState] || [];
  localGovernmentSelect.innerHTML = '<option value="" disabled selected>Select your local government</option>';
  localGovernments.forEach(lg => {
    const option = document.createElement("option");
    option.value = lg.toLowerCase().replace(/\s+/g, "-");
    option.textContent = lg;
    localGovernmentSelect.appendChild(option);
  });
});

// Terms and Conditions Modal
const termsLink = document.getElementById('view-terms');
const termsModal = document.getElementById('terms-modal');
const closeTermsModal = document.getElementById('close-terms-modal');

termsLink.addEventListener('click', (e) => {
  e.preventDefault();
  termsModal.style.display = 'block';
});

closeTermsModal.addEventListener('click', () => {
  termsModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === termsModal) {
termsModal.style.display = 'none';
  }
});

// Trigger change event to populate LGAs on page load if a state is pre-selected
stateSelect.dispatchEvent(new Event("change"));


// Updated Signup Function
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const verificationMethod = document.querySelector('input[name="verification-method"]:checked')?.value;

  if (!verificationMethod) {
    showToast("Please select a verification method.");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (verificationMethod === 'email') {
      await sendEmailVerification(user);
      switchView('email-verification-view');
      showToast("Verification email sent. Please check your inbox.");
    } else if (verificationMethod === 'phone') {
      switchView('phone-verification-view');
      showToast("Please verify your phone number.");
    }
  } catch (error) {
    showToast(error.message);
  }
});

// Email Verification Check
document.getElementById('check-email-verification-btn').addEventListener('click', async () => {
  await auth.currentUser.reload();
  if (auth.currentUser.emailVerified) {
    await setDoc(doc(db, "users", auth.currentUser.uid), {
      email: auth.currentUser.email,
      isVerified: true
    }, { merge: true });

    showToast("Email verified!");
    switchView('dashboard-view');
    setupSettingsToggle();
  } else {
    showToast("Email not verified yet. Try again.");
  }
});

// Phone Verification Flow
document.getElementById('send-verification-code-btn').addEventListener('click', async () => {
  const phoneNumber = document.getElementById('phone-number').value.trim();
  const appVerifier = new RecaptchaVerifier('recaptcha-container', {
    size: 'invisible',
    callback: (response) => {}
  }, auth);

  try {
    window.confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
    showToast("Verification code sent!");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('verify-code-btn').addEventListener('click', async () => {
  const code = document.getElementById('verification-code').value.trim();
  try {
    await window.confirmationResult.confirm(code);

    await setDoc(doc(db, "users", auth.currentUser.uid), {
      phone: auth.currentUser.phoneNumber,
      isVerified: true
    }, { merge: true });

    showToast("Phone verified!");
    switchView('dashboard-view');
    setupSettingsToggle();
  } catch (error) {
    showToast("Invalid code or verification failed.");
  }
});


// ✅ Enhanced Settings Menu Toggle (Only call after dashboard loads)
function setupSettingsToggle() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsMenu = document.getElementById('settings-menu');

  if (settingsBtn && settingsMenu) {
    settingsBtn.addEventListener('click', () => {
      const isVisible = settingsMenu.style.display === 'block';
      settingsMenu.style.display = isVisible ? 'none' : 'block';

      // Add a smooth transition effect
      settingsMenu.style.opacity = isVisible ? '0' : '1';
      settingsMenu.style.transition = 'opacity 0.3s ease-in-out';
    });

    document.addEventListener('click', (event) => {
      if (!settingsBtn.contains(event.target) && !settingsMenu.contains(event.target)) {
        settingsMenu.style.display = 'none';
        settingsMenu.style.opacity = '0';
      }
    });
  } else {
    console.error("Settings button or menu not found in the DOM.");
  }
}