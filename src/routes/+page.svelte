<script lang="ts">
  import { getAllArticles } from '../lib/database'
  import { goto } from '$app/navigation'

  let articles = $state<Array<any>>([])

  $effect.pre(() => {
    // Fetch articles before DOM updates
    getAllArticles().then((result) => {
      console.log(result)
      articles = result
    })
  })
</script>

<div class="container">
  {#if articles.length}
    <div class="flex-squares">
      <div class="square">
        <div class="img-flex">
          {#each articles as article}
            <a href="/article/{encodeURIComponent(article.url)}">
              <img src={article?.mainImage} alt="Article" class="mini-img" />
            </a>
          {/each}
        </div>
      </div>
      <div class="square">
        <div class="img-flex">
          {#each articles as article}
            <a href="/article/{encodeURIComponent(article.url)}">
              <img src={article?.mainImage} alt="Article" class="mini-img" />
            </a>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <p>No articles found.</p>
  {/if}
</div>

<style>
  .container {
    padding: 20px;
  }
  .flex-squares {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 50px;
    margin-top: 2rem;
  }
  .square {
    display: inline-flex;
    position: relative;
    flex-direction: column;
    align-items: center;
    border-radius: 20%;
    background: rgb(154, 154, 154, 0.1);
    padding: 20px;
    width: 180px;
    height: 180px;
    color: white;
    font-weight: bold;
  }

  .img-flex {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: flex-start;
    gap: 10px;
    padding: 20px;
    width: 100%;
    height: 100%;
  }

  .mini-img {
    border-radius: 15px;
    width: 50px;
    height: 50px;
    object-fit: cover;
  }

  .img-button {
    transition: transform 0.2s ease-in-out;
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
  }

  .img-button:hover {
    transform: scale(1.05);
  }

  .img-button:active {
    transform: scale(0.98);
  }
</style>
