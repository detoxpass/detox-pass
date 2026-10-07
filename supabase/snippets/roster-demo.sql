-- Catálogo de prova da home. Roda uma vez no projeto detoxpass.
-- Não cria agenda, horário nem senha conhecida. O e-mail é .invalid e não recebe mensagem.
-- Repetir o arquivo não duplica quem já entrou com esse e-mail.

insert into public.cities (name, slug)
select v.name, v.slug
from (values
    ('Boston', 'boston'),
    ('Cambridge', 'cambridge'),
    ('Somerville', 'somerville'),
    ('New York', 'new-york'),
    ('Brooklyn', 'brooklyn'),
    ('Miami', 'miami'),
    ('Chicago', 'chicago'),
    ('Austin', 'austin'),
    ('Seattle', 'seattle'),
    ('Los Angeles', 'los-angeles'),
    ('San Diego', 'san-diego'),
    ('Denver', 'denver'),
    ('Atlanta', 'atlanta'),
    ('Portland', 'portland'),
    ('Philadelphia', 'philadelphia')
) as v(name, slug)
where not exists (
  select 1 from public.cities c where lower(c.name) = lower(v.name)
);

insert into public.specialties (name, slug)
select v.name, v.slug
from (values
    ('Deep tissue', 'deep-tissue'),
    ('Aromatherapy', 'aromatherapy'),
    ('Swedish massage', 'swedish-massage'),
    ('Sports massage', 'sports-massage'),
    ('Hot stone', 'hot-stone'),
    ('Prenatal massage', 'prenatal-massage'),
    ('Reflexology', 'reflexology'),
    ('Thai massage', 'thai-massage'),
    ('Lymphatic drainage', 'lymphatic-drainage'),
    ('Myofascial release', 'myofascial-release'),
    ('Chair massage', 'chair-massage'),
    ('Couples massage', 'couples-massage')
) as v(name, slug)
where not exists (
  select 1 from public.specialties s where lower(s.name) = lower(v.name)
);

insert into public.services (name, slug, price_cents, currency)
select v.name, v.slug, v.price, 'USD'
from (values
    ('Deep tissue', 'deep-tissue', 10000),
    ('Aromatherapy', 'aromatherapy', 12000),
    ('Swedish massage', 'swedish-massage', 9000),
    ('Sports massage', 'sports-massage', 11000),
    ('Hot stone', 'hot-stone', 14000),
    ('Prenatal massage', 'prenatal-massage', 13000),
    ('Reflexology', 'reflexology', 8000),
    ('Thai massage', 'thai-massage', 15000),
    ('Lymphatic drainage', 'lymphatic-drainage', 16000),
    ('Myofascial release', 'myofascial-release', 17000),
    ('Chair massage', 'chair-massage', 7000),
    ('Couples massage', 'couples-massage', 18000)
) as v(name, slug, price)
where not exists (
  select 1 from public.services s where lower(s.name) = lower(v.name)
);

update public.services s
set price_cents = v.price, currency = 'USD'
from (values
    ('Deep tissue', 'deep-tissue', 10000),
    ('Aromatherapy', 'aromatherapy', 12000),
    ('Swedish massage', 'swedish-massage', 9000),
    ('Sports massage', 'sports-massage', 11000),
    ('Hot stone', 'hot-stone', 14000),
    ('Prenatal massage', 'prenatal-massage', 13000),
    ('Reflexology', 'reflexology', 8000),
    ('Thai massage', 'thai-massage', 15000),
    ('Lymphatic drainage', 'lymphatic-drainage', 16000),
    ('Myofascial release', 'myofascial-release', 17000),
    ('Chair massage', 'chair-massage', 7000),
    ('Couples massage', 'couples-massage', 18000)
) as v(name, slug, price)
where lower(s.name) = lower(v.name)
  and s.price_cents is null;

do $$
declare
  v_instance uuid;
  v_hash text;
  v_user uuid;
  v_pro uuid;
  v_spec uuid;
  v_service uuid;
  v_city uuid;
  v_extra_service uuid;
  v_extra_city uuid;
  r record;
  v_specs uuid[] := array[]::uuid[];
  v_services uuid[] := array[]::uuid[];
  v_cities uuid[] := array[]::uuid[];
  v_zones text[] := array[
    'America/New_York', 'America/New_York', 'America/New_York', 'America/New_York', 'America/New_York',
    'America/New_York', 'America/Chicago', 'America/Chicago', 'America/Los_Angeles', 'America/Los_Angeles',
    'America/Los_Angeles', 'America/Denver', 'America/New_York', 'America/Los_Angeles', 'America/New_York'
  ];
  v_name text;
  v_tz text;
begin
  select instance_id into v_instance from auth.users limit 1;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000';
  end if;
  v_hash := extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf', 6));

  for v_name in
    select n from (values
      ('Deep tissue'), ('Aromatherapy'), ('Swedish massage'), ('Sports massage'),
      ('Hot stone'), ('Prenatal massage'), ('Reflexology'), ('Thai massage'),
      ('Lymphatic drainage'), ('Myofascial release'), ('Chair massage'), ('Couples massage')
    ) as names(n)
  loop
    select id into v_spec from public.specialties where lower(name) = lower(v_name) order by created_at limit 1;
    select id into v_service from public.services where lower(name) = lower(v_name) order by created_at limit 1;
    v_specs := v_specs || v_spec;
    v_services := v_services || v_service;
  end loop;

  for v_name in
    select n from (values
      ('Boston'), ('Cambridge'), ('Somerville'), ('New York'), ('Brooklyn'),
      ('Miami'), ('Chicago'), ('Austin'), ('Seattle'), ('Los Angeles'),
      ('San Diego'), ('Denver'), ('Atlanta'), ('Portland'), ('Philadelphia')
    ) as names(n)
  loop
    select id into v_city from public.cities where lower(name) = lower(v_name) order by created_at limit 1;
    v_cities := v_cities || v_city;
  end loop;

  for r in
    select * from (values
    ('roster-001@demo.detoxpass.invalid', 'Maya Almeida', '/people/roster/001.webp', 0, 0, 1, 1),
    ('roster-002@demo.detoxpass.invalid', 'Lena Almeida', '/people/roster/002.webp', 1, 0, -1, -1),
    ('roster-003@demo.detoxpass.invalid', 'Sofia Almeida', '/people/roster/003.webp', 2, 0, -1, -1),
    ('roster-004@demo.detoxpass.invalid', 'Amina Almeida', '/people/roster/004.webp', 3, 0, 4, -1),
    ('roster-005@demo.detoxpass.invalid', 'Chloe Almeida', '/people/roster/005.webp', 4, 0, -1, -1),
    ('roster-006@demo.detoxpass.invalid', 'Nora Almeida', '/people/roster/006.webp', 5, 0, -1, 1),
    ('roster-007@demo.detoxpass.invalid', 'Elena Almeida', '/people/roster/007.webp', 6, 0, 7, -1),
    ('roster-008@demo.detoxpass.invalid', 'Iris Almeida', '/people/roster/008.webp', 7, 0, -1, -1),
    ('roster-009@demo.detoxpass.invalid', 'Hana Almeida', '/people/roster/009.webp', 8, 0, -1, -1),
    ('roster-010@demo.detoxpass.invalid', 'Leila Almeida', '/people/roster/010.webp', 9, 0, 10, -1),
    ('roster-011@demo.detoxpass.invalid', 'Priya Almeida', '/people/roster/011.webp', 10, 0, -1, 1),
    ('roster-012@demo.detoxpass.invalid', 'Camila Almeida', '/people/roster/012.webp', 11, 0, -1, -1),
    ('roster-013@demo.detoxpass.invalid', 'Ines Almeida', '/people/roster/013.webp', 0, 1, 1, -1),
    ('roster-014@demo.detoxpass.invalid', 'Ruth Almeida', '/people/roster/014.webp', 1, 1, -1, -1),
    ('roster-015@demo.detoxpass.invalid', 'Clara Almeida', '/people/roster/015.webp', 2, 1, -1, -1),
    ('roster-016@demo.detoxpass.invalid', 'Nina Almeida', '/people/roster/016.webp', 3, 1, 4, 2),
    ('roster-017@demo.detoxpass.invalid', 'Ada Almeida', '/people/roster/017.webp', 4, 1, -1, -1),
    ('roster-018@demo.detoxpass.invalid', 'Mila Almeida', '/people/roster/018.webp', 5, 1, -1, -1),
    ('roster-019@demo.detoxpass.invalid', 'Zara Almeida', '/people/roster/019.webp', 6, 1, 7, -1),
    ('roster-020@demo.detoxpass.invalid', 'Eva Almeida', '/people/roster/020.webp', 7, 1, -1, -1),
    ('roster-021@demo.detoxpass.invalid', 'Noor Almeida', '/people/roster/021.webp', 8, 1, -1, 2),
    ('roster-022@demo.detoxpass.invalid', 'Lila Almeida', '/people/roster/022.webp', 9, 1, 10, -1),
    ('roster-023@demo.detoxpass.invalid', 'June Almeida', '/people/roster/023.webp', 10, 1, -1, -1),
    ('roster-024@demo.detoxpass.invalid', 'Rosa Almeida', '/people/roster/024.webp', 11, 1, -1, -1),
    ('roster-025@demo.detoxpass.invalid', 'Anya Almeida', '/people/roster/025.webp', 0, 2, 1, -1),
    ('roster-026@demo.detoxpass.invalid', 'Vera Almeida', '/people/roster/026.webp', 1, 2, -1, 3),
    ('roster-027@demo.detoxpass.invalid', 'Thea Almeida', '/people/roster/027.webp', 2, 2, -1, -1),
    ('roster-028@demo.detoxpass.invalid', 'Maya Bennett', '/people/roster/028.webp', 3, 2, 4, -1),
    ('roster-029@demo.detoxpass.invalid', 'Lena Bennett', '/people/roster/029.webp', 4, 2, -1, -1),
    ('roster-030@demo.detoxpass.invalid', 'Sofia Bennett', '/people/roster/030.webp', 5, 2, -1, -1),
    ('roster-031@demo.detoxpass.invalid', 'Amina Bennett', '/people/roster/031.webp', 6, 2, 7, 3),
    ('roster-032@demo.detoxpass.invalid', 'Chloe Bennett', '/people/roster/032.webp', 7, 2, -1, -1),
    ('roster-033@demo.detoxpass.invalid', 'Nora Bennett', '/people/roster/033.webp', 8, 2, -1, -1),
    ('roster-034@demo.detoxpass.invalid', 'Elena Bennett', '/people/roster/034.webp', 9, 2, 10, -1),
    ('roster-035@demo.detoxpass.invalid', 'Iris Bennett', '/people/roster/035.webp', 10, 2, -1, -1),
    ('roster-036@demo.detoxpass.invalid', 'Hana Bennett', '/people/roster/036.webp', 11, 2, -1, 3),
    ('roster-037@demo.detoxpass.invalid', 'Leila Bennett', '/people/roster/037.webp', 0, 3, 1, -1),
    ('roster-038@demo.detoxpass.invalid', 'Priya Bennett', '/people/roster/038.webp', 1, 3, -1, -1),
    ('roster-039@demo.detoxpass.invalid', 'Camila Bennett', '/people/roster/039.webp', 2, 3, -1, -1),
    ('roster-040@demo.detoxpass.invalid', 'Ines Bennett', '/people/roster/040.webp', 3, 3, 4, -1),
    ('roster-041@demo.detoxpass.invalid', 'Ruth Bennett', '/people/roster/041.webp', 4, 3, -1, 4),
    ('roster-042@demo.detoxpass.invalid', 'Clara Bennett', '/people/roster/042.webp', 5, 3, -1, -1),
    ('roster-043@demo.detoxpass.invalid', 'Nina Bennett', '/people/roster/043.webp', 6, 3, 7, -1),
    ('roster-044@demo.detoxpass.invalid', 'Ada Bennett', '/people/roster/044.webp', 7, 3, -1, -1),
    ('roster-045@demo.detoxpass.invalid', 'Mila Bennett', '/people/roster/045.webp', 8, 3, -1, -1),
    ('roster-046@demo.detoxpass.invalid', 'Zara Bennett', '/people/roster/046.webp', 9, 3, 10, 4),
    ('roster-047@demo.detoxpass.invalid', 'Eva Bennett', '/people/roster/047.webp', 10, 3, -1, -1),
    ('roster-048@demo.detoxpass.invalid', 'Noor Bennett', '/people/roster/048.webp', 11, 3, -1, -1),
    ('roster-049@demo.detoxpass.invalid', 'Lila Bennett', '/people/roster/049.webp', 0, 4, 1, -1),
    ('roster-050@demo.detoxpass.invalid', 'June Bennett', '/people/roster/050.webp', 1, 4, -1, -1),
    ('roster-051@demo.detoxpass.invalid', 'Rosa Bennett', '/people/roster/051.webp', 2, 4, -1, 5),
    ('roster-052@demo.detoxpass.invalid', 'Anya Bennett', '/people/roster/052.webp', 3, 4, 4, -1),
    ('roster-053@demo.detoxpass.invalid', 'Vera Bennett', '/people/roster/053.webp', 4, 4, -1, -1),
    ('roster-054@demo.detoxpass.invalid', 'Thea Bennett', '/people/roster/054.webp', 5, 4, -1, -1),
    ('roster-055@demo.detoxpass.invalid', 'Maya Carter', '/people/roster/055.webp', 6, 4, 7, -1),
    ('roster-056@demo.detoxpass.invalid', 'Lena Carter', '/people/roster/056.webp', 7, 4, -1, 5),
    ('roster-057@demo.detoxpass.invalid', 'Sofia Carter', '/people/roster/057.webp', 8, 4, -1, -1),
    ('roster-058@demo.detoxpass.invalid', 'Amina Carter', '/people/roster/058.webp', 9, 4, 10, -1),
    ('roster-059@demo.detoxpass.invalid', 'Chloe Carter', '/people/roster/059.webp', 10, 4, -1, -1),
    ('roster-060@demo.detoxpass.invalid', 'Nora Carter', '/people/roster/060.webp', 11, 4, -1, -1),
    ('roster-061@demo.detoxpass.invalid', 'Elena Carter', '/people/roster/061.webp', 0, 5, 1, 6),
    ('roster-062@demo.detoxpass.invalid', 'Iris Carter', '/people/roster/062.webp', 1, 5, -1, -1),
    ('roster-063@demo.detoxpass.invalid', 'Hana Carter', '/people/roster/063.webp', 2, 5, -1, -1),
    ('roster-064@demo.detoxpass.invalid', 'Leila Carter', '/people/roster/064.webp', 3, 5, 4, -1),
    ('roster-065@demo.detoxpass.invalid', 'Priya Carter', '/people/roster/065.webp', 4, 5, -1, -1),
    ('roster-066@demo.detoxpass.invalid', 'Camila Carter', '/people/roster/066.webp', 5, 5, -1, 6),
    ('roster-067@demo.detoxpass.invalid', 'Ines Carter', '/people/roster/067.webp', 6, 5, 7, -1),
    ('roster-068@demo.detoxpass.invalid', 'Ruth Carter', '/people/roster/068.webp', 7, 5, -1, -1),
    ('roster-069@demo.detoxpass.invalid', 'Clara Carter', '/people/roster/069.webp', 8, 5, -1, -1),
    ('roster-070@demo.detoxpass.invalid', 'Nina Carter', '/people/roster/070.webp', 9, 5, 10, -1),
    ('roster-071@demo.detoxpass.invalid', 'Ada Carter', '/people/roster/071.webp', 10, 5, -1, 6),
    ('roster-072@demo.detoxpass.invalid', 'Mila Carter', '/people/roster/072.webp', 11, 5, -1, -1),
    ('roster-073@demo.detoxpass.invalid', 'Zara Carter', '/people/roster/073.webp', 0, 6, 1, -1),
    ('roster-074@demo.detoxpass.invalid', 'Eva Carter', '/people/roster/074.webp', 1, 6, -1, -1),
    ('roster-075@demo.detoxpass.invalid', 'Noor Carter', '/people/roster/075.webp', 2, 6, -1, -1),
    ('roster-076@demo.detoxpass.invalid', 'Lila Carter', '/people/roster/076.webp', 3, 6, 4, 7),
    ('roster-077@demo.detoxpass.invalid', 'June Carter', '/people/roster/077.webp', 4, 6, -1, -1),
    ('roster-078@demo.detoxpass.invalid', 'Rosa Carter', '/people/roster/078.webp', 5, 6, -1, -1),
    ('roster-079@demo.detoxpass.invalid', 'Anya Carter', '/people/roster/079.webp', 6, 6, 7, -1),
    ('roster-080@demo.detoxpass.invalid', 'Vera Carter', '/people/roster/080.webp', 7, 6, -1, -1),
    ('roster-081@demo.detoxpass.invalid', 'Thea Carter', '/people/roster/081.webp', 8, 6, -1, 7),
    ('roster-082@demo.detoxpass.invalid', 'Maya Duarte', '/people/roster/082.webp', 9, 6, 10, -1),
    ('roster-083@demo.detoxpass.invalid', 'Lena Duarte', '/people/roster/083.webp', 10, 6, -1, -1),
    ('roster-084@demo.detoxpass.invalid', 'Sofia Duarte', '/people/roster/084.webp', 11, 6, -1, -1),
    ('roster-085@demo.detoxpass.invalid', 'Amina Duarte', '/people/roster/085.webp', 0, 7, 1, -1),
    ('roster-086@demo.detoxpass.invalid', 'Chloe Duarte', '/people/roster/086.webp', 1, 7, -1, 8),
    ('roster-087@demo.detoxpass.invalid', 'Nora Duarte', '/people/roster/087.webp', 2, 7, -1, -1),
    ('roster-088@demo.detoxpass.invalid', 'Elena Duarte', '/people/roster/088.webp', 3, 7, 4, -1),
    ('roster-089@demo.detoxpass.invalid', 'Iris Duarte', '/people/roster/089.webp', 4, 7, -1, -1),
    ('roster-090@demo.detoxpass.invalid', 'Hana Duarte', '/people/roster/090.webp', 5, 7, -1, -1),
    ('roster-091@demo.detoxpass.invalid', 'Leila Duarte', '/people/roster/091.webp', 6, 7, 7, 8),
    ('roster-092@demo.detoxpass.invalid', 'Priya Duarte', '/people/roster/092.webp', 7, 7, -1, -1),
    ('roster-093@demo.detoxpass.invalid', 'Camila Duarte', '/people/roster/093.webp', 8, 7, -1, -1),
    ('roster-094@demo.detoxpass.invalid', 'Ines Duarte', '/people/roster/094.webp', 9, 7, 10, -1),
    ('roster-095@demo.detoxpass.invalid', 'Ruth Duarte', '/people/roster/095.webp', 10, 7, -1, -1),
    ('roster-096@demo.detoxpass.invalid', 'Clara Duarte', '/people/roster/096.webp', 11, 7, -1, 8),
    ('roster-097@demo.detoxpass.invalid', 'Nina Duarte', '/people/roster/097.webp', 0, 8, 1, -1),
    ('roster-098@demo.detoxpass.invalid', 'Ada Duarte', '/people/roster/098.webp', 1, 8, -1, -1),
    ('roster-099@demo.detoxpass.invalid', 'Mila Duarte', '/people/roster/099.webp', 2, 8, -1, -1),
    ('roster-100@demo.detoxpass.invalid', 'Zara Duarte', '/people/roster/100.webp', 3, 8, 4, -1),
    ('roster-101@demo.detoxpass.invalid', 'Eva Duarte', '/people/roster/101.webp', 4, 8, -1, 9),
    ('roster-102@demo.detoxpass.invalid', 'Noor Duarte', '/people/roster/102.webp', 5, 8, -1, -1),
    ('roster-103@demo.detoxpass.invalid', 'Lila Duarte', '/people/roster/103.webp', 6, 8, 7, -1),
    ('roster-104@demo.detoxpass.invalid', 'June Duarte', '/people/roster/104.webp', 7, 8, -1, -1),
    ('roster-105@demo.detoxpass.invalid', 'Rosa Duarte', '/people/roster/105.webp', 8, 8, -1, -1),
    ('roster-106@demo.detoxpass.invalid', 'Anya Duarte', '/people/roster/106.webp', 9, 8, 10, 9),
    ('roster-107@demo.detoxpass.invalid', 'Vera Duarte', '/people/roster/107.webp', 10, 8, -1, -1),
    ('roster-108@demo.detoxpass.invalid', 'Thea Duarte', '/people/roster/108.webp', 11, 8, -1, -1),
    ('roster-109@demo.detoxpass.invalid', 'Maya Ellis', '/people/roster/109.webp', 0, 9, 1, -1),
    ('roster-110@demo.detoxpass.invalid', 'Lena Ellis', '/people/roster/110.webp', 1, 9, -1, -1),
    ('roster-111@demo.detoxpass.invalid', 'Sofia Ellis', '/people/roster/111.webp', 2, 9, -1, 10),
    ('roster-112@demo.detoxpass.invalid', 'Amina Ellis', '/people/roster/112.webp', 3, 9, 4, -1),
    ('roster-113@demo.detoxpass.invalid', 'Chloe Ellis', '/people/roster/113.webp', 4, 9, -1, -1),
    ('roster-114@demo.detoxpass.invalid', 'Nora Ellis', '/people/roster/114.webp', 5, 9, -1, -1),
    ('roster-115@demo.detoxpass.invalid', 'Elena Ellis', '/people/roster/115.webp', 6, 9, 7, -1),
    ('roster-116@demo.detoxpass.invalid', 'Iris Ellis', '/people/roster/116.webp', 7, 9, -1, 10),
    ('roster-117@demo.detoxpass.invalid', 'Hana Ellis', '/people/roster/117.webp', 8, 9, -1, -1),
    ('roster-118@demo.detoxpass.invalid', 'Leila Ellis', '/people/roster/118.webp', 9, 9, 10, -1),
    ('roster-119@demo.detoxpass.invalid', 'Priya Ellis', '/people/roster/119.webp', 10, 9, -1, -1),
    ('roster-120@demo.detoxpass.invalid', 'Camila Ellis', '/people/roster/120.webp', 11, 9, -1, -1),
    ('roster-121@demo.detoxpass.invalid', 'Ines Ellis', '/people/roster/121.webp', 0, 10, 1, 11),
    ('roster-122@demo.detoxpass.invalid', 'Ruth Ellis', '/people/roster/122.webp', 1, 10, -1, -1),
    ('roster-123@demo.detoxpass.invalid', 'Clara Ellis', '/people/roster/123.webp', 2, 10, -1, -1),
    ('roster-124@demo.detoxpass.invalid', 'Nina Ellis', '/people/roster/124.webp', 3, 10, 4, -1),
    ('roster-125@demo.detoxpass.invalid', 'Ada Ellis', '/people/roster/125.webp', 4, 10, -1, -1),
    ('roster-126@demo.detoxpass.invalid', 'Mila Ellis', '/people/roster/126.webp', 5, 10, -1, 11),
    ('roster-127@demo.detoxpass.invalid', 'Zara Ellis', '/people/roster/127.webp', 6, 10, 7, -1),
    ('roster-128@demo.detoxpass.invalid', 'Eva Ellis', '/people/roster/128.webp', 7, 10, -1, -1),
    ('roster-129@demo.detoxpass.invalid', 'Noor Ellis', '/people/roster/129.webp', 8, 10, -1, -1),
    ('roster-130@demo.detoxpass.invalid', 'Lila Ellis', '/people/roster/130.webp', 9, 10, 10, -1),
    ('roster-131@demo.detoxpass.invalid', 'June Ellis', '/people/roster/131.webp', 10, 10, -1, 11),
    ('roster-132@demo.detoxpass.invalid', 'Rosa Ellis', '/people/roster/132.webp', 11, 10, -1, -1),
    ('roster-133@demo.detoxpass.invalid', 'Anya Ellis', '/people/roster/133.webp', 0, 11, 1, -1),
    ('roster-134@demo.detoxpass.invalid', 'Vera Ellis', '/people/roster/134.webp', 1, 11, -1, -1),
    ('roster-135@demo.detoxpass.invalid', 'Thea Ellis', '/people/roster/135.webp', 2, 11, -1, -1),
    ('roster-136@demo.detoxpass.invalid', 'Maya Ferreira', '/people/roster/136.webp', 3, 11, 4, 12),
    ('roster-137@demo.detoxpass.invalid', 'Lena Ferreira', '/people/roster/137.webp', 4, 11, -1, -1),
    ('roster-138@demo.detoxpass.invalid', 'Sofia Ferreira', '/people/roster/138.webp', 5, 11, -1, -1),
    ('roster-139@demo.detoxpass.invalid', 'Amina Ferreira', '/people/roster/139.webp', 6, 11, 7, -1),
    ('roster-140@demo.detoxpass.invalid', 'Chloe Ferreira', '/people/roster/140.webp', 7, 11, -1, -1),
    ('roster-141@demo.detoxpass.invalid', 'Nora Ferreira', '/people/roster/141.webp', 8, 11, -1, 12),
    ('roster-142@demo.detoxpass.invalid', 'Elena Ferreira', '/people/roster/142.webp', 9, 11, 10, -1),
    ('roster-143@demo.detoxpass.invalid', 'Iris Ferreira', '/people/roster/143.webp', 10, 11, -1, -1),
    ('roster-144@demo.detoxpass.invalid', 'Hana Ferreira', '/people/roster/144.webp', 11, 11, -1, -1),
    ('roster-145@demo.detoxpass.invalid', 'Leila Ferreira', '/people/roster/145.webp', 0, 12, 1, -1),
    ('roster-146@demo.detoxpass.invalid', 'Priya Ferreira', '/people/roster/146.webp', 1, 12, -1, 13),
    ('roster-147@demo.detoxpass.invalid', 'Camila Ferreira', '/people/roster/147.webp', 2, 12, -1, -1),
    ('roster-148@demo.detoxpass.invalid', 'Ines Ferreira', '/people/roster/148.webp', 3, 12, 4, -1),
    ('roster-149@demo.detoxpass.invalid', 'Ruth Ferreira', '/people/roster/149.webp', 4, 12, -1, -1),
    ('roster-150@demo.detoxpass.invalid', 'Clara Ferreira', '/people/roster/150.webp', 5, 12, -1, -1),
    ('roster-151@demo.detoxpass.invalid', 'Nina Ferreira', '/people/roster/151.webp', 6, 12, 7, 13),
    ('roster-152@demo.detoxpass.invalid', 'Ada Ferreira', '/people/roster/152.webp', 7, 12, -1, -1),
    ('roster-153@demo.detoxpass.invalid', 'Mila Ferreira', '/people/roster/153.webp', 8, 12, -1, -1),
    ('roster-154@demo.detoxpass.invalid', 'Zara Ferreira', '/people/roster/154.webp', 9, 12, 10, -1),
    ('roster-155@demo.detoxpass.invalid', 'Eva Ferreira', '/people/roster/155.webp', 10, 12, -1, -1),
    ('roster-156@demo.detoxpass.invalid', 'Noor Ferreira', '/people/roster/156.webp', 11, 12, -1, 13),
    ('roster-157@demo.detoxpass.invalid', 'Lila Ferreira', '/people/roster/157.webp', 0, 13, 1, -1),
    ('roster-158@demo.detoxpass.invalid', 'June Ferreira', '/people/roster/158.webp', 1, 13, -1, -1),
    ('roster-159@demo.detoxpass.invalid', 'Rosa Ferreira', '/people/roster/159.webp', 2, 13, -1, -1),
    ('roster-160@demo.detoxpass.invalid', 'Anya Ferreira', '/people/roster/160.webp', 3, 13, 4, -1),
    ('roster-161@demo.detoxpass.invalid', 'Vera Ferreira', '/people/roster/161.webp', 4, 13, -1, 14),
    ('roster-162@demo.detoxpass.invalid', 'Thea Ferreira', '/people/roster/162.webp', 5, 13, -1, -1),
    ('roster-163@demo.detoxpass.invalid', 'Maya Grant', '/people/roster/163.webp', 6, 13, 7, -1),
    ('roster-164@demo.detoxpass.invalid', 'Lena Grant', '/people/roster/164.webp', 7, 13, -1, -1),
    ('roster-165@demo.detoxpass.invalid', 'Sofia Grant', '/people/roster/165.webp', 8, 13, -1, -1),
    ('roster-166@demo.detoxpass.invalid', 'Amina Grant', '/people/roster/166.webp', 9, 13, 10, 14),
    ('roster-167@demo.detoxpass.invalid', 'Chloe Grant', '/people/roster/167.webp', 10, 13, -1, -1),
    ('roster-168@demo.detoxpass.invalid', 'Nora Grant', '/people/roster/168.webp', 11, 13, -1, -1),
    ('roster-169@demo.detoxpass.invalid', 'Elena Grant', '/people/roster/169.webp', 0, 14, 1, -1),
    ('roster-170@demo.detoxpass.invalid', 'Iris Grant', '/people/roster/170.webp', 1, 14, -1, -1),
    ('roster-171@demo.detoxpass.invalid', 'Hana Grant', '/people/roster/171.webp', 2, 14, -1, 0),
    ('roster-172@demo.detoxpass.invalid', 'Leila Grant', '/people/roster/172.webp', 3, 14, 4, -1),
    ('roster-173@demo.detoxpass.invalid', 'Priya Grant', '/people/roster/173.webp', 4, 14, -1, -1),
    ('roster-174@demo.detoxpass.invalid', 'Camila Grant', '/people/roster/174.webp', 5, 14, -1, -1),
    ('roster-175@demo.detoxpass.invalid', 'Ines Grant', '/people/roster/175.webp', 6, 14, 7, -1),
    ('roster-176@demo.detoxpass.invalid', 'Ruth Grant', '/people/roster/176.webp', 7, 14, -1, 0),
    ('roster-177@demo.detoxpass.invalid', 'Clara Grant', '/people/roster/177.webp', 8, 14, -1, -1),
    ('roster-178@demo.detoxpass.invalid', 'Nina Grant', '/people/roster/178.webp', 9, 14, 10, -1),
    ('roster-179@demo.detoxpass.invalid', 'Ada Grant', '/people/roster/179.webp', 10, 14, -1, -1),
    ('roster-180@demo.detoxpass.invalid', 'Mila Grant', '/people/roster/180.webp', 11, 14, -1, -1),
    ('roster-181@demo.detoxpass.invalid', 'Zara Grant', '/people/roster/181.webp', 0, 0, 1, 1),
    ('roster-182@demo.detoxpass.invalid', 'Eva Grant', '/people/roster/182.webp', 1, 0, -1, -1),
    ('roster-183@demo.detoxpass.invalid', 'Noor Grant', '/people/roster/183.webp', 2, 0, -1, -1),
    ('roster-184@demo.detoxpass.invalid', 'Lila Grant', '/people/roster/184.webp', 3, 0, 4, -1),
    ('roster-185@demo.detoxpass.invalid', 'June Grant', '/people/roster/185.webp', 4, 0, -1, -1),
    ('roster-186@demo.detoxpass.invalid', 'Rosa Grant', '/people/roster/186.webp', 5, 0, -1, 1),
    ('roster-187@demo.detoxpass.invalid', 'Anya Grant', '/people/roster/187.webp', 6, 0, 7, -1),
    ('roster-188@demo.detoxpass.invalid', 'Vera Grant', '/people/roster/188.webp', 7, 0, -1, -1),
    ('roster-189@demo.detoxpass.invalid', 'Thea Grant', '/people/roster/189.webp', 8, 0, -1, -1),
    ('roster-190@demo.detoxpass.invalid', 'Maya Hassan', '/people/roster/190.webp', 9, 0, 10, -1),
    ('roster-191@demo.detoxpass.invalid', 'Lena Hassan', '/people/roster/191.webp', 10, 0, -1, 1),
    ('roster-192@demo.detoxpass.invalid', 'Sofia Hassan', '/people/roster/192.webp', 11, 0, -1, -1),
    ('roster-193@demo.detoxpass.invalid', 'Amina Hassan', '/people/roster/193.webp', 0, 1, 1, -1),
    ('roster-194@demo.detoxpass.invalid', 'Chloe Hassan', '/people/roster/194.webp', 1, 1, -1, -1),
    ('roster-195@demo.detoxpass.invalid', 'Nora Hassan', '/people/roster/195.webp', 2, 1, -1, -1),
    ('roster-196@demo.detoxpass.invalid', 'Elena Hassan', '/people/roster/196.webp', 3, 1, 4, 2),
    ('roster-197@demo.detoxpass.invalid', 'Iris Hassan', '/people/roster/197.webp', 4, 1, -1, -1),
    ('roster-198@demo.detoxpass.invalid', 'Hana Hassan', '/people/roster/198.webp', 5, 1, -1, -1),
    ('roster-199@demo.detoxpass.invalid', 'Leila Hassan', '/people/roster/199.webp', 6, 1, 7, -1),
    ('roster-200@demo.detoxpass.invalid', 'Priya Hassan', '/people/roster/200.webp', 7, 1, -1, -1),
    ('roster-201@demo.detoxpass.invalid', 'Camila Hassan', '/people/roster/201.webp', 8, 1, -1, 2),
    ('roster-202@demo.detoxpass.invalid', 'Ines Hassan', '/people/roster/202.webp', 9, 1, 10, -1),
    ('roster-203@demo.detoxpass.invalid', 'Ruth Hassan', '/people/roster/203.webp', 10, 1, -1, -1),
    ('roster-204@demo.detoxpass.invalid', 'Clara Hassan', '/people/roster/204.webp', 11, 1, -1, -1),
    ('roster-205@demo.detoxpass.invalid', 'Nina Hassan', '/people/roster/205.webp', 0, 2, 1, -1),
    ('roster-206@demo.detoxpass.invalid', 'Ada Hassan', '/people/roster/206.webp', 1, 2, -1, 3),
    ('roster-207@demo.detoxpass.invalid', 'Mila Hassan', '/people/roster/207.webp', 2, 2, -1, -1),
    ('roster-208@demo.detoxpass.invalid', 'Zara Hassan', '/people/roster/208.webp', 3, 2, 4, -1),
    ('roster-209@demo.detoxpass.invalid', 'Eva Hassan', '/people/roster/209.webp', 4, 2, -1, -1),
    ('roster-210@demo.detoxpass.invalid', 'Noor Hassan', '/people/roster/210.webp', 5, 2, -1, -1),
    ('roster-211@demo.detoxpass.invalid', 'Lila Hassan', '/people/roster/211.webp', 6, 2, 7, 3),
    ('roster-212@demo.detoxpass.invalid', 'June Hassan', '/people/roster/212.webp', 7, 2, -1, -1),
    ('roster-213@demo.detoxpass.invalid', 'Rosa Hassan', '/people/roster/213.webp', 8, 2, -1, -1),
    ('roster-214@demo.detoxpass.invalid', 'Anya Hassan', '/people/roster/214.webp', 9, 2, 10, -1),
    ('roster-215@demo.detoxpass.invalid', 'Vera Hassan', '/people/roster/215.webp', 10, 2, -1, -1),
    ('roster-216@demo.detoxpass.invalid', 'Thea Hassan', '/people/roster/216.webp', 11, 2, -1, 3),
    ('roster-217@demo.detoxpass.invalid', 'Maya Ibrahim', '/people/roster/217.webp', 0, 3, 1, -1),
    ('roster-218@demo.detoxpass.invalid', 'Lena Ibrahim', '/people/roster/218.webp', 1, 3, -1, -1),
    ('roster-219@demo.detoxpass.invalid', 'Sofia Ibrahim', '/people/roster/219.webp', 2, 3, -1, -1),
    ('roster-220@demo.detoxpass.invalid', 'Amina Ibrahim', '/people/roster/220.webp', 3, 3, 4, -1),
    ('roster-221@demo.detoxpass.invalid', 'Chloe Ibrahim', '/people/roster/221.webp', 4, 3, -1, 4),
    ('roster-222@demo.detoxpass.invalid', 'Nora Ibrahim', '/people/roster/222.webp', 5, 3, -1, -1),
    ('roster-223@demo.detoxpass.invalid', 'Elena Ibrahim', '/people/roster/223.webp', 6, 3, 7, -1),
    ('roster-224@demo.detoxpass.invalid', 'Iris Ibrahim', '/people/roster/224.webp', 7, 3, -1, -1),
    ('roster-225@demo.detoxpass.invalid', 'Hana Ibrahim', '/people/roster/225.webp', 8, 3, -1, -1),
    ('roster-226@demo.detoxpass.invalid', 'Leila Ibrahim', '/people/roster/226.webp', 9, 3, 10, 4),
    ('roster-227@demo.detoxpass.invalid', 'Priya Ibrahim', '/people/roster/227.webp', 10, 3, -1, -1),
    ('roster-228@demo.detoxpass.invalid', 'Camila Ibrahim', '/people/roster/228.webp', 11, 3, -1, -1),
    ('roster-229@demo.detoxpass.invalid', 'Ines Ibrahim', '/people/roster/229.webp', 0, 4, 1, -1),
    ('roster-230@demo.detoxpass.invalid', 'Ruth Ibrahim', '/people/roster/230.webp', 1, 4, -1, -1),
    ('roster-231@demo.detoxpass.invalid', 'Clara Ibrahim', '/people/roster/231.webp', 2, 4, -1, 5),
    ('roster-232@demo.detoxpass.invalid', 'Nina Ibrahim', '/people/roster/232.webp', 3, 4, 4, -1),
    ('roster-233@demo.detoxpass.invalid', 'Ada Ibrahim', '/people/roster/233.webp', 4, 4, -1, -1),
    ('roster-234@demo.detoxpass.invalid', 'Mila Ibrahim', '/people/roster/234.webp', 5, 4, -1, -1),
    ('roster-235@demo.detoxpass.invalid', 'Zara Ibrahim', '/people/roster/235.webp', 6, 4, 7, -1),
    ('roster-236@demo.detoxpass.invalid', 'Eva Ibrahim', '/people/roster/236.webp', 7, 4, -1, 5),
    ('roster-237@demo.detoxpass.invalid', 'Noor Ibrahim', '/people/roster/237.webp', 8, 4, -1, -1),
    ('roster-238@demo.detoxpass.invalid', 'Lila Ibrahim', '/people/roster/238.webp', 9, 4, 10, -1),
    ('roster-239@demo.detoxpass.invalid', 'June Ibrahim', '/people/roster/239.webp', 10, 4, -1, -1),
    ('roster-240@demo.detoxpass.invalid', 'Rosa Ibrahim', '/people/roster/240.webp', 11, 4, -1, -1),
    ('roster-241@demo.detoxpass.invalid', 'Anya Ibrahim', '/people/roster/241.webp', 0, 5, 1, 6),
    ('roster-242@demo.detoxpass.invalid', 'Vera Ibrahim', '/people/roster/242.webp', 1, 5, -1, -1),
    ('roster-243@demo.detoxpass.invalid', 'Thea Ibrahim', '/people/roster/243.webp', 2, 5, -1, -1),
    ('roster-244@demo.detoxpass.invalid', 'Maya Jensen', '/people/roster/244.webp', 3, 5, 4, -1),
    ('roster-245@demo.detoxpass.invalid', 'Lena Jensen', '/people/roster/245.webp', 4, 5, -1, -1),
    ('roster-246@demo.detoxpass.invalid', 'Sofia Jensen', '/people/roster/246.webp', 5, 5, -1, 6),
    ('roster-247@demo.detoxpass.invalid', 'Amina Jensen', '/people/roster/247.webp', 6, 5, 7, -1),
    ('roster-248@demo.detoxpass.invalid', 'Chloe Jensen', '/people/roster/248.webp', 7, 5, -1, -1),
    ('roster-249@demo.detoxpass.invalid', 'Nora Jensen', '/people/roster/249.webp', 8, 5, -1, -1),
    ('roster-250@demo.detoxpass.invalid', 'Elena Jensen', '/people/roster/250.webp', 9, 5, 10, -1),
    ('roster-251@demo.detoxpass.invalid', 'Iris Jensen', '/people/roster/251.webp', 10, 5, -1, 6),
    ('roster-252@demo.detoxpass.invalid', 'Hana Jensen', '/people/roster/252.webp', 11, 5, -1, -1),
    ('roster-253@demo.detoxpass.invalid', 'Leila Jensen', '/people/roster/253.webp', 0, 6, 1, -1),
    ('roster-254@demo.detoxpass.invalid', 'Priya Jensen', '/people/roster/254.webp', 1, 6, -1, -1),
    ('roster-255@demo.detoxpass.invalid', 'Camila Jensen', '/people/roster/255.webp', 2, 6, -1, -1),
    ('roster-256@demo.detoxpass.invalid', 'Ines Jensen', '/people/roster/256.webp', 3, 6, 4, 7),
    ('roster-257@demo.detoxpass.invalid', 'Ruth Jensen', '/people/roster/257.webp', 4, 6, -1, -1),
    ('roster-258@demo.detoxpass.invalid', 'Clara Jensen', '/people/roster/258.webp', 5, 6, -1, -1),
    ('roster-259@demo.detoxpass.invalid', 'Nina Jensen', '/people/roster/259.webp', 6, 6, 7, -1),
    ('roster-260@demo.detoxpass.invalid', 'Ada Jensen', '/people/roster/260.webp', 7, 6, -1, -1),
    ('roster-261@demo.detoxpass.invalid', 'Mila Jensen', '/people/roster/261.webp', 8, 6, -1, 7),
    ('roster-262@demo.detoxpass.invalid', 'Zara Jensen', '/people/roster/262.webp', 9, 6, 10, -1),
    ('roster-263@demo.detoxpass.invalid', 'Eva Jensen', '/people/roster/263.webp', 10, 6, -1, -1),
    ('roster-264@demo.detoxpass.invalid', 'Noor Jensen', '/people/roster/264.webp', 11, 6, -1, -1),
    ('roster-265@demo.detoxpass.invalid', 'Lila Jensen', '/people/roster/265.webp', 0, 7, 1, -1),
    ('roster-266@demo.detoxpass.invalid', 'June Jensen', '/people/roster/266.webp', 1, 7, -1, 8),
    ('roster-267@demo.detoxpass.invalid', 'Rosa Jensen', '/people/roster/267.webp', 2, 7, -1, -1),
    ('roster-268@demo.detoxpass.invalid', 'Anya Jensen', '/people/roster/268.webp', 3, 7, 4, -1),
    ('roster-269@demo.detoxpass.invalid', 'Vera Jensen', '/people/roster/269.webp', 4, 7, -1, -1),
    ('roster-270@demo.detoxpass.invalid', 'Thea Jensen', '/people/roster/270.webp', 5, 7, -1, -1),
    ('roster-271@demo.detoxpass.invalid', 'Maya Kaur', '/people/roster/271.webp', 6, 7, 7, 8),
    ('roster-272@demo.detoxpass.invalid', 'Lena Kaur', '/people/roster/272.webp', 7, 7, -1, -1),
    ('roster-273@demo.detoxpass.invalid', 'Sofia Kaur', '/people/roster/273.webp', 8, 7, -1, -1),
    ('roster-274@demo.detoxpass.invalid', 'Amina Kaur', '/people/roster/274.webp', 9, 7, 10, -1),
    ('roster-275@demo.detoxpass.invalid', 'Chloe Kaur', '/people/roster/275.webp', 10, 7, -1, -1),
    ('roster-276@demo.detoxpass.invalid', 'Nora Kaur', '/people/roster/276.webp', 11, 7, -1, 8),
    ('roster-277@demo.detoxpass.invalid', 'Elena Kaur', '/people/roster/277.webp', 0, 8, 1, -1),
    ('roster-278@demo.detoxpass.invalid', 'Iris Kaur', '/people/roster/278.webp', 1, 8, -1, -1),
    ('roster-279@demo.detoxpass.invalid', 'Hana Kaur', '/people/roster/279.webp', 2, 8, -1, -1),
    ('roster-280@demo.detoxpass.invalid', 'Leila Kaur', '/people/roster/280.webp', 3, 8, 4, -1),
    ('roster-281@demo.detoxpass.invalid', 'Priya Kaur', '/people/roster/281.webp', 4, 8, -1, 9),
    ('roster-282@demo.detoxpass.invalid', 'Camila Kaur', '/people/roster/282.webp', 5, 8, -1, -1),
    ('roster-283@demo.detoxpass.invalid', 'Ines Kaur', '/people/roster/283.webp', 6, 8, 7, -1),
    ('roster-284@demo.detoxpass.invalid', 'Ruth Kaur', '/people/roster/284.webp', 7, 8, -1, -1),
    ('roster-285@demo.detoxpass.invalid', 'Clara Kaur', '/people/roster/285.webp', 8, 8, -1, -1),
    ('roster-286@demo.detoxpass.invalid', 'Nina Kaur', '/people/roster/286.webp', 9, 8, 10, 9),
    ('roster-287@demo.detoxpass.invalid', 'Ada Kaur', '/people/roster/287.webp', 10, 8, -1, -1),
    ('roster-288@demo.detoxpass.invalid', 'Mila Kaur', '/people/roster/288.webp', 11, 8, -1, -1),
    ('roster-289@demo.detoxpass.invalid', 'Zara Kaur', '/people/roster/289.webp', 0, 9, 1, -1),
    ('roster-290@demo.detoxpass.invalid', 'Eva Kaur', '/people/roster/290.webp', 1, 9, -1, -1),
    ('roster-291@demo.detoxpass.invalid', 'Noor Kaur', '/people/roster/291.webp', 2, 9, -1, 10),
    ('roster-292@demo.detoxpass.invalid', 'Lila Kaur', '/people/roster/292.webp', 3, 9, 4, -1),
    ('roster-293@demo.detoxpass.invalid', 'June Kaur', '/people/roster/293.webp', 4, 9, -1, -1),
    ('roster-294@demo.detoxpass.invalid', 'Rosa Kaur', '/people/roster/294.webp', 5, 9, -1, -1),
    ('roster-295@demo.detoxpass.invalid', 'Anya Kaur', '/people/roster/295.webp', 6, 9, 7, -1),
    ('roster-296@demo.detoxpass.invalid', 'Vera Kaur', '/people/roster/296.webp', 7, 9, -1, 10),
    ('roster-297@demo.detoxpass.invalid', 'Thea Kaur', '/people/roster/297.webp', 8, 9, -1, -1),
    ('roster-298@demo.detoxpass.invalid', 'Maya Lambert', '/people/roster/298.webp', 9, 9, 10, -1),
    ('roster-299@demo.detoxpass.invalid', 'Lena Lambert', '/people/roster/299.webp', 10, 9, -1, -1),
    ('roster-300@demo.detoxpass.invalid', 'Sofia Lambert', '/people/roster/300.webp', 11, 9, -1, -1),
    ('roster-301@demo.detoxpass.invalid', 'Amina Lambert', '/people/roster/301.webp', 0, 10, 1, 11),
    ('roster-302@demo.detoxpass.invalid', 'Chloe Lambert', '/people/roster/302.webp', 1, 10, -1, -1),
    ('roster-303@demo.detoxpass.invalid', 'Nora Lambert', '/people/roster/303.webp', 2, 10, -1, -1),
    ('roster-304@demo.detoxpass.invalid', 'Elena Lambert', '/people/roster/304.webp', 3, 10, 4, -1),
    ('roster-305@demo.detoxpass.invalid', 'Iris Lambert', '/people/roster/305.webp', 4, 10, -1, -1),
    ('roster-306@demo.detoxpass.invalid', 'Hana Lambert', '/people/roster/306.webp', 5, 10, -1, 11),
    ('roster-307@demo.detoxpass.invalid', 'Leila Lambert', '/people/roster/307.webp', 6, 10, 7, -1),
    ('roster-308@demo.detoxpass.invalid', 'Priya Lambert', '/people/roster/308.webp', 7, 10, -1, -1),
    ('roster-309@demo.detoxpass.invalid', 'Camila Lambert', '/people/roster/309.webp', 8, 10, -1, -1),
    ('roster-310@demo.detoxpass.invalid', 'Ines Lambert', '/people/roster/310.webp', 9, 10, 10, -1),
    ('roster-311@demo.detoxpass.invalid', 'Ruth Lambert', '/people/roster/311.webp', 10, 10, -1, 11),
    ('roster-312@demo.detoxpass.invalid', 'Clara Lambert', '/people/roster/312.webp', 11, 10, -1, -1),
    ('roster-313@demo.detoxpass.invalid', 'Nina Lambert', '/people/roster/313.webp', 0, 11, 1, -1),
    ('roster-314@demo.detoxpass.invalid', 'Ada Lambert', '/people/roster/314.webp', 1, 11, -1, -1),
    ('roster-315@demo.detoxpass.invalid', 'Mila Lambert', '/people/roster/315.webp', 2, 11, -1, -1),
    ('roster-316@demo.detoxpass.invalid', 'Zara Lambert', '/people/roster/316.webp', 3, 11, 4, 12),
    ('roster-317@demo.detoxpass.invalid', 'Eva Lambert', '/people/roster/317.webp', 4, 11, -1, -1),
    ('roster-318@demo.detoxpass.invalid', 'Noor Lambert', '/people/roster/318.webp', 5, 11, -1, -1),
    ('roster-319@demo.detoxpass.invalid', 'Lila Lambert', '/people/roster/319.webp', 6, 11, 7, -1),
    ('roster-320@demo.detoxpass.invalid', 'June Lambert', '/people/roster/320.webp', 7, 11, -1, -1),
    ('roster-321@demo.detoxpass.invalid', 'Rosa Lambert', '/people/roster/321.webp', 8, 11, -1, 12),
    ('roster-322@demo.detoxpass.invalid', 'Anya Lambert', '/people/roster/322.webp', 9, 11, 10, -1),
    ('roster-323@demo.detoxpass.invalid', 'Vera Lambert', '/people/roster/323.webp', 10, 11, -1, -1),
    ('roster-324@demo.detoxpass.invalid', 'Thea Lambert', '/people/roster/324.webp', 11, 11, -1, -1)
    ) as people(email, display_name, photo, spec_idx, city_idx, extra_service_idx, extra_city_idx)
  loop
    select id into v_user from auth.users where email = r.email;
    if v_user is null then
      v_user := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        v_instance, v_user, 'authenticated', 'authenticated', r.email, v_hash, now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'profissional'),
        jsonb_build_object('full_name', r.display_name),
        now(), now(), '', '', '', ''
      );
      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user,
        jsonb_build_object('sub', v_user::text, 'email', r.email, 'email_verified', true),
        'email', v_user::text, now(), now(), now()
      );
    end if;

    update public.profiles
    set full_name = r.display_name
    where id = v_user;

    v_tz := v_zones[r.city_idx + 1];
    select id into v_pro from public.professionals where profile_id = v_user;
    if v_pro is null then
      insert into public.professionals (
        profile_id, display_name, bio, active, portrait_path, schedule_mode, schedule_timezone, slot_minutes
      ) values (
        v_user, r.display_name,
        'Massage therapist available for sessions booked on Detox Pass.',
        true, r.photo, 'internal', v_tz, 60
      )
      returning id into v_pro;
    else
      update public.professionals
      set display_name = r.display_name,
          bio = 'Massage therapist available for sessions booked on Detox Pass.',
          active = true,
          portrait_path = r.photo,
          schedule_mode = 'internal',
          schedule_timezone = v_tz,
          slot_minutes = 60
      where id = v_pro;
    end if;

    v_spec := v_specs[r.spec_idx + 1];
    v_service := v_services[r.spec_idx + 1];
    v_city := v_cities[r.city_idx + 1];
    insert into public.professional_specialties (professional_id, specialty_id)
    values (v_pro, v_spec)
    on conflict do nothing;
    insert into public.professional_services (professional_id, service_id)
    values (v_pro, v_service)
    on conflict do nothing;
    insert into public.professional_cities (professional_id, city_id)
    values (v_pro, v_city)
    on conflict do nothing;

    if r.extra_service_idx >= 0 then
      v_extra_service := v_services[r.extra_service_idx + 1];
      insert into public.professional_services (professional_id, service_id)
      values (v_pro, v_extra_service)
      on conflict do nothing;
    end if;
    if r.extra_city_idx >= 0 then
      v_extra_city := v_cities[r.extra_city_idx + 1];
      insert into public.professional_cities (professional_id, city_id)
      values (v_pro, v_extra_city)
      on conflict do nothing;
    end if;

    insert into public.professional_hours (professional_id, weekday, start_minute, end_minute)
    select v_pro, day, 540, 1020
    from generate_series(1, 5) as day
    where not exists (
      select 1 from public.professional_hours existing
      where existing.professional_id = v_pro
    );

    insert into public.professional_steps (professional_id, step)
    values (v_pro, 'profile'), (v_pro, 'calendar')
    on conflict do nothing;

    insert into public.calendar_order (professional_id, calendar_key, position)
    values (v_pro, 'internal', 1)
    on conflict do nothing;
  end loop;
end $$;
